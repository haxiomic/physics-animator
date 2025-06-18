import { EventSignal } from "@haxiomic/event-signal";
import { IFieldAnimator, StepResult } from "./IFieldAnimator.js";
import { SpringAnimator, SpringParameters } from "./animators/SpringAnimator.js";
import { easeInOutStep, easeInStep, easeOutStep, EasingStepFn, linearStep, TweenAnimator } from "./animators/TweenAnimator.js";

type FieldKey = string | number | symbol;

type FieldAnimation<Params, State> = {
	animator: IFieldAnimator<Params, State, any>,
	state: State,
	params: Params | null,
}

/**
 * Physically based animation of numeric properties of objects
 * 
 * Designed to avoid discontinuities for smooth animation in all conditions
 */
export class Animator {

	animations = new Map<any, Map<FieldKey, FieldAnimation<any, any>>>();

	protected readonly events = {
		beforeStep: new EventSignal<{ dt_s: number }>(),
		afterStep: new EventSignal<{ dt_s: number }>(),
		completeField: new EventSignal<{ object: any, field: FieldKey }>(),
		completeObject: new EventSignal<{ object: any }>(),
	}
	protected changeObjectEvents = new Map<any, EventSignal<any>>();
	protected changeFieldEvents = new Map<any, Map<FieldKey, EventSignal<{ object: any, field: any }>>>();
	// we use these signals to coalesce object change events
	protected beforeChange = new EventSignal<void>();
	protected afterChange = new EventSignal<void>();

	constructor(onBeforeStep?: (dt_s: number) => void, onAfterStep?: (dt_s: number) => void) {
		if (onBeforeStep) {
			this.events.beforeStep.addListener(e => onBeforeStep(e.dt_s));
		}
		if (onAfterStep) {
			this.events.afterStep.addListener(e => onAfterStep(e.dt_s));
		}
	}

	setTo<Obj>(
		object: Obj,
		target: Partial<Obj>
	): void {
		this.beforeChange.dispatch();
		forObjectFieldsRecursive(object, target, (obj, field, targetValue) => {
			this.setFieldTo(obj, field, targetValue);
			this.dispatchChangeObjectEvent(obj);
		});
		this.afterChange.dispatch();
	}

	animateTo<Obj, Parameters, State, FieldType>(
		object: Obj,
		target: Partial<Obj>,
		animator: IFieldAnimator<Parameters, State, FieldType>,
		params: Parameters | null = null
	): void {
		forObjectFieldsRecursive(object, target, (subObj, field, targetValue) => {
			this.syncAnimation(subObj, field, targetValue, animator, params);
		});
	}

	springTo<Obj>(
		object: Obj,
		target: Partial<Obj>,
		params: SpringParameters | null
	): void {
		this.animateTo(
			object,
			target,
			SpringAnimator,
			params
		);
	}

	customTweenTo<Obj>(
		object: Obj,
		target: Partial<Obj>,
		duration_s: number,
		easingFn: EasingStepFn
	): void {
		this.animateTo(
			object,
			target,
			TweenAnimator,
			{
				duration_s,
				easingFn,
			}
		);
	}

	linearTo<Obj>(
		object: Obj,
		target: Partial<Obj>,
		duration_s: number
	): void {
		this.customTweenTo(object, target, duration_s, linearStep);
	}

	easeInOutTo<Obj>(
		object: Obj,
		target: Partial<Obj>,
		duration_s: number
	): void {
		this.customTweenTo(object, target, duration_s, easeInOutStep);
	}

	easeInTo<Obj>(
		object: Obj,
		target: Partial<Obj>,
		duration_s: number
	): void {
		this.customTweenTo(object, target, duration_s, easeInStep);
	}

	easeOutTo<Obj>(
		object: Obj,
		target: Partial<Obj>,
		duration_s: number
	): void {
		this.customTweenTo(object, target, duration_s, easeOutStep);
	}

	onCompleteField<Obj, Name extends keyof Obj>(
		object: Obj,
		field: Name,
		callback: (object: Obj, field: Name) => void,
		once?: 'once'
	) {
		let listener = this.events.completeField.addListener(e => {
			if (e.object === object && e.field === field) {
				callback(object, field);
				if (once) {
					listener.remove();
				}
			}
		});
		return listener;
	}

	onComplete<Obj>(
		object: Obj,
		callback: (object: Obj) => void,
		once?: 'once'
	) {
		const listener = this.events.completeObject.addListener(e => {
			if (e.object === object) {
				callback(object);
				if (once) {
					listener.remove();
				}
			}
		});
		return listener;
	}

	onChangeField<Obj, Name extends keyof Obj>(
		object: Obj,
		field: Name,
		callback: (object: Obj, field: Name) => void
	) {
		// check if field is an object
		if (typeof object[field] === 'object' && object[field] !== null) {
			return this.onChange(object[field], (subObject) => {
				callback(object, field);
			});
		} else {
			// add a listener for this field
			return this.addChangeFieldListener(object, field, callback);
		}
	}

	onChange<Obj>(
		object: Obj,
		callback: (object: Obj) => void
	) {
		// add a listener for this object and every sub-object

		const removeCallbacks = new Array<() => void>();

		// coalesce events within a single step
		let objectChanged = false;
		removeCallbacks.push(
			this.beforeChange.addListener(() => {
				objectChanged = false;
			}).remove,

			this.afterChange.addListener(() => {
				if (objectChanged) {
					callback(object);
				}
			}).remove
		);

		const subObjectChangedCallback = (subObject: any) => {
			objectChanged = true;
		}

		enumerateObjects(object, (subObject) => {
			let signal = this.changeObjectEvents.get(object);
			if (signal == null) {
				signal = new EventSignal();
				this.changeObjectEvents.set(subObject, signal);
			}

			const subListener = signal.addListener(subObjectChangedCallback);

			removeCallbacks.push(() => {
				subListener.remove()
				if (!signal.hasListeners()) {
					this.changeObjectEvents.delete(object);
				}
			});
		});

		return {
			remove: () => {
				for (const remove of removeCallbacks) {
					remove();
				}
			}
		};
	}

	onBeforeStep(callback: (dt_s: number) => void) {
		return this.events.beforeStep.addListener(e => callback(e.dt_s));
	}

	onAfterStep(callback: (dt_s: number) => void) {
		return this.events.afterStep.addListener(e => callback(e.dt_s));
	}

	step(dt_s: number) {
		this.events.beforeStep.dispatch({ dt_s });
		this.beforeChange.dispatch();

		// step all animations
		for (let [object, objectAnims] of this.animations.entries()) {
			for (let [field, animation] of objectAnims.entries()) {
				let result = animation.animator.step(animation.state, object, field, animation.params, dt_s);

				// dispatch the field change event
				this.dispatchChangeFieldEvent(object, field);

				// handle animation completion
				switch (result) {
					case StepResult.Complete: {
						objectAnims.delete(field);
						this.events.completeField.dispatch({ object, field });
					} break;
				}
			};

			// dispatch the object change event
			this.dispatchChangeObjectEvent(object);

			// remove the object if it has no more springs
			if (objectAnims.size == 0) {
				this.animations.delete(object);
				this.events.completeObject.dispatch({ object });
			}
		};

		this.afterChange.dispatch();
		this.events.afterStep.dispatch({ dt_s });
	}

	private t_last = -1;
	tick() {
		let t_s = performance.now() / 1000;
		let dt_s = this.t_last >= 0 ? t_s - this.t_last : 1 / 60;
		this.t_last = t_s;
		this.step(dt_s);
		return dt_s;
	}

	protected _currentLoopControl: { stop: () => void, start: () => void } | null = null;

	/**
	 * Start the animation loop using requestAnimationFrame
	 * 
	 * This will stop any existing animation loop
	 */
	startAnimationFrameLoop() {
		this.stop();

		let frameLoopHandle = -1;
		let frameLoop = () => {
			this.tick();
			frameLoopHandle = window.requestAnimationFrame(frameLoop);
		};
		frameLoop();

		this._currentLoopControl = {
			stop: () => {
				window.cancelAnimationFrame(frameLoopHandle);
			},
			start: () => {
				frameLoop();
			}
		}
	}

	/**
	 * Start the animation loop using setTimeout
	 * 
	 * This will stop any existing animation loop
	 */
	startIntervalLoop(interval_ms: number = 1000 / 240) {
		this.stop();

		let intervalHandle = -1;
		let intervalLoop = () => {
			this.tick();
			intervalHandle = window.setTimeout(intervalLoop, interval_ms);
		};
		intervalLoop();

		this._currentLoopControl = {
			stop: () => {
				window.clearTimeout(intervalHandle);
			},
			start: () => {
				intervalLoop();
			}
		}
	}

	stop() {
		if (this._currentLoopControl != null) {
			this._currentLoopControl.stop();
			this._currentLoopControl = null;
		}
	}

	/**
	 * Remove animation for this object and field if it exists
	 * Does not change the value of the field
	 */
	remove<T>(object: T, field: keyof T, dispatchComplete: boolean = false) {
		let objectAnimations = this.animations.get(object);
		if (objectAnimations != null) {
			objectAnimations.delete(field);
			if (dispatchComplete) {
				this.events.completeField.dispatch({ object, field });
			}
		}
		// if there are no more springs for this object, remove it from the map
		if (objectAnimations != null && objectAnimations.size == 0) {
			this.removeObject(object, dispatchComplete);
		}
	}

	/**
	 * Remove all animations for this object
	 */
	removeObject(object: any, dispatchComplete: boolean = false) {
		this.animations.delete(object);
		if (dispatchComplete) {
			this.events.completeObject.dispatch({ object });
		}
	}

	/**
	 * Remove all animations
	 */
	removeAll(dispatchComplete: boolean = false) {
		for (let [object, objectAnimations] of this.animations.entries()) {
			for (let field of objectAnimations.keys()) {
				this.remove(object, field, dispatchComplete);
			}
		}
		this.animations.clear();
	}

	getState<Obj, Name extends keyof Obj>(object: Obj, field: Name) {
		let animation = this.getObjectAnimations(object).get(field);
		return animation?.state;
	}

	protected dispatchChangeObjectEvent(object: any) {
		let signal = this.changeObjectEvents.get(object);
		if (signal == null) {
			return;
		}
		signal.dispatch(object);
	}

	protected dispatchChangeFieldEvent<Obj, Name extends keyof Obj>(
		object: Obj,
		field: Name
	) {
		const map = this.changeFieldEvents.get(object);
		if (map == null) {
			return;
		}
		let signal = map.get(field);
		if (signal == null) {
			return;
		}
		if (signal.hasListeners()) {
			signal.dispatch({ object, field });
		}
	}

	protected addChangeFieldListener<Obj, Name extends keyof Obj>(
		object: Obj,
		field: Name,
		callback: (object: Obj, field: Name) => void,
	) {
		const getOrCreateChangeFieldSignal = <Obj, Name extends keyof Obj>(
			object: Obj,
			field: Name
		) => {
			let map = this.changeFieldEvents.get(object);
			if (map == null) {
				map = new Map();
				this.changeFieldEvents.set(object, map);
			}
			let signal = map.get(field);
			if (signal == null) {
				signal = new EventSignal<{ object: Obj, field: Name }>();
				map.set(field, signal);
			}
			return signal;
		}

		const signal = getOrCreateChangeFieldSignal(object, field);
		const listener = signal.addListener((e) => {
			callback(e.object, e.field);
		});

		return {
			remove: () => {
				listener.remove();

				// cleanup
				if (!signal.hasListeners()) {
					let map = this.changeFieldEvents.get(object);
					map?.delete(field);
					if (map != null && map.size === 0) {
						this.changeFieldEvents.delete(object);
					}
				}
			}
		};
	}

	/**
	 * Remove animation from the object and set the field to the target value
	 * 
	 * This completes the animation immediately and dispatches the onComplete event
	 */
	protected setFieldTo<Obj, Name extends keyof Obj, V extends Obj[Name]>(
		object: Obj,
		field: Name,
		targetValue: V
	) {
		const dispatchComplete = true;
		this.remove(object, field, dispatchComplete);
		object[field] = targetValue;

		// dispatch the field change event
		this.dispatchChangeFieldEvent(object, field);
	}


	/**
	 * Creates a new map if one doesn't already exist for the given object
	 */
	private getObjectAnimations(object: any) {
		let objectAnimations = this.animations.get(object);
		if (objectAnimations == null) {
			// create
			objectAnimations = new Map();
			this.animations.set(object, objectAnimations);
		}
		return objectAnimations;
	}

	/**
	 * Creates a new spring if one doesn't already exist for the given object and field
	 */
	private syncAnimation<Params, State, FieldType>(object: any, field: FieldKey, targetValue: any, fieldAnimator: IFieldAnimator<Params, State, FieldType>, params: Params | null = null) {
		let objectAnimations = this.getObjectAnimations(object);
		let animation = objectAnimations.get(field);
		let animatorChanged = animation?.animator !== fieldAnimator;
		if (animation == null || animatorChanged) {
			// create
			animation = {
				animator: fieldAnimator,
				state: fieldAnimator.createState(object, field, targetValue, params),
				params,
			}
			objectAnimations.set(field, animation);
		} else {
			animation.params = params;
			animation.animator.updateState(animation.state, object, field, targetValue, params);
		}
		return animation;
	}

}

function forObjectFieldsRecursive<T extends any>(
	sourceObj: T,
	targetObj: Partial<T>,
	callback: (object: any, field: string, targetValue: any) => void
) {
	for (let field in targetObj) {
		if (Object.hasOwn(targetObj, field)) {
			let targetValue = targetObj[field];
			if (typeof targetValue === 'object') {
				forObjectFieldsRecursive(sourceObj[field], targetValue, callback);
			} else {
				callback(sourceObj, field, targetValue);
			}
		}
	}
}

function enumerateObjects(input: any, callback: (obj: object) => void): void {
	// Call callback for the current object if it's an object or array
	if (typeof input === 'object' && input !== null) {
		callback(input);

		// Recursively enumerate nested objects
		if (Array.isArray(input)) {
			for (const item of input) {
				enumerateObjects(item, callback);
			}
		} else {
			for (const key in input) {
				if (input.hasOwnProperty(key)) {
					enumerateObjects(input[key], callback);
				}
			}
		}
	}
}
