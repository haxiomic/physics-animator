import { EventSignal } from "@haxiomic/event-signal";
import { Spring, SpringParameters } from "./Spring.js";

enum AnimationType {
	Spring = 0,
	Tween,
}

type FieldKey = string | number | symbol;

type FieldAnimation = {
	target: number,
	animationType: AnimationType,
	springParams: Spring.PhysicsParameters | null,
	tweenParams: Tween.Parameters | null,
	step: TweenStepFn | null,
	velocity: number,
}

/**
 * Physically based animation of numeric properties of objects
 * 
 * Designed to avoid discontinuities for smooth animation in all conditions
 */
export class Animator {

	readonly events = {
		beforeStep: new EventSignal<{dt_s: number}>(),
		afterStep: new EventSignal<{dt_s: number}>(),
		completeField: new EventSignal<{object: any, field: FieldKey}>(),
		completeObject: new EventSignal<{object: any}>(),
	}

	animations = new Map<any, Map<FieldKey, FieldAnimation>>();

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

	springTo<Obj>(
		object: Obj,
		target: Partial<Obj>,
		params: SpringParameters | null
	): void {
		forObjectFieldsRecursive(object, target, (obj, field, targetValue) => {
			this.springFieldTo(obj, field, targetValue, params);
		});
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

	customTweenTo<Obj>(
		object: Obj,
		target: Partial<Obj>,
		duration_s: number,
		step: TweenStepFn
	): void {
		forObjectFieldsRecursive(object, target, (obj, field, targetValue) => {
			this.customTweenFieldTo(obj, field, targetValue as number, duration_s, step);
		});
	}

	linearTo<Obj>(
		object: Obj,
		target: Partial<Obj>,
		duration_s: number
	): void {
		this.customTweenTo(object, target, duration_s, Tween.linearStep);
	}

	easeInOutTo<Obj>(
		object: Obj,
		target: Partial<Obj>,
		duration_s: number
	): void {
		this.customTweenTo(object, target, duration_s, Tween.easeInOutStep);
	}

	easeInTo<Obj>(
		object: Obj,
		target: Partial<Obj>,
		duration_s: number
	): void {
		this.customTweenTo(object, target, duration_s, Tween.easeInStep);
	}

	easeOutTo<Obj>(
		object: Obj,
		target: Partial<Obj>,
		duration_s: number
	): void {
		this.customTweenTo(object, target, duration_s, Tween.easeOutStep);
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

	private _springState = { x: 0, targetX: 0, v: 0 };
	step(dt_s: number) {
		this.events.beforeStep.dispatch({dt_s});
		this.beforeChange.dispatch();

		let springState = this._springState

		// step all animations
		for (let [object, objectAnims] of this.animations.entries()) {
			for (let [field, animation] of objectAnims.entries()) {
				switch (animation.animationType) {
					case AnimationType.Spring: {
						// step the spring
						springState.x = object[field];
						springState.targetX = animation.target;
						springState.v = animation.velocity;
						if (animation.springParams != null && isFinite(animation.springParams.strength) && isFinite(animation.springParams.damping)) {
							Spring.stepSpring(dt_s, springState, animation.springParams);
						} else {
							// instant transition: set to the target
							springState.x = springState.targetX;
							springState.v = 0;
						}
						// update the object
						object[field] = springState.x;
						animation.velocity = springState.v;

						// remove the spring if it's close enough to the target and velocity is close to 0
						if (Math.abs(springState.x - springState.targetX) < 0.0001 && Math.abs(springState.v) < 0.0001) {
							object[field] = animation.target;
							objectAnims.delete(field);
							this.events.completeField.dispatch({object, field});
						}
					} break;
					case AnimationType.Tween: {
						// step the tween
						let x = object[field];
						animation.step!(object, field, animation.target, animation.tweenParams!, dt_s);
						let x_new = object[field];
						animation.velocity = (x_new - x) / dt_s;

						// remove the tween if it's complete
						let deltaTime_s = (performance.now() - animation.tweenParams!.t0_ms) / 1000;
						if (deltaTime_s >= animation.tweenParams!.duration_s) {
							object[field] = animation.target;
							objectAnims.delete(field);
							this.events.completeField.dispatch({object, field});
						}
						break;
					}
				}

				// dispatch the field change event
				this.dispatchChangeFieldEvent(object, field);
			};

			// dispatch the object change event
			this.dispatchChangeObjectEvent(object);

			// remove the object if it has no more springs
			if (objectAnims.size == 0) {
				this.animations.delete(object);
				this.events.completeObject.dispatch({object});
			}
		};

		this.afterChange.dispatch();
		this.events.afterStep.dispatch({dt_s});
	}

	private t_last = -1;
	tick() {
		let t_s = performance.now() / 1000;
		let dt_s = this.t_last >= 0 ? t_s - this.t_last : 1/60;
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
				this.events.completeField.dispatch({object, field});
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
			this.events.completeObject.dispatch({object});
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

	getVelocity<Obj, Name extends keyof Obj>(object: Obj, field: Name) {
		let spring = this.getObjectAnimations(object).get(field);
		return spring?.velocity ?? 0;
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

	protected springFieldTo<Obj, Name extends keyof Obj>(
		object: Obj,
		field: Name,
		targetValue: Obj[Name] & number,
		params: SpringParameters | null = { duration_s: 0.5 },
	) {
		if (params != null) {
			const spring = this.getAnimationOrCreate(object, field, AnimationType.Spring);
			// update the target and parameters
			spring.animationType = AnimationType.Spring;
			spring.target = targetValue;
			spring.springParams = Spring.getPhysicsParameters(params);
			spring.step = null;
		} else {
			this.setFieldTo(object, field, targetValue);
		}
	}

	protected customTweenFieldTo<Obj, Name extends keyof Obj>(
		object: Obj,
		field: Name,
		targetValue: Obj[Name] & number,
		duration_s: number, step: TweenStepFn
	) {
		const animation = this.getAnimationOrCreate(object, field, AnimationType.Tween);
		animation.animationType = AnimationType.Tween;
		animation.target = targetValue;
		animation.tweenParams = {
			x0: object[field] as number,
			t0_ms: performance.now(),
			duration_s: duration_s,
		}
		animation.step = step;
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
	private getAnimationOrCreate(object: any, field: FieldKey, type: AnimationType) {
		let objectAnimations = this.getObjectAnimations(object);
		let animation = objectAnimations.get(field);
		if (animation == null) {
			// create
			animation = {
				target: 0,
				animationType: type,
				springParams: null,
				tweenParams: null,
				velocity: 0,
				step: null
			};
			objectAnimations.set(field, animation);
		} else {
			animation.animationType = type;
		}
		return animation;
	}

}

export type TweenStepFn = (object: any, field: FieldKey, target: number, params: Tween.Parameters, dt_s: number) => void;

export namespace Tween {

	export type Parameters = {
		x0: number,
		t0_ms: number,
		duration_s: number,
	}

	export function linearStep(
		object: any,
		field: FieldKey,
		target: number,
		params: Tween.Parameters,
		dt_s: number
	) {
		let dx = target - params.x0;
		let t = (performance.now() - params.t0_ms) / 1000;
		let u = t / params.duration_s;
		let x_new = params.x0 + dx * u;
		object[field] = x_new;
	}

	// cubic ease in out
	export function easeInOutStep(
		object: any,
		field: FieldKey,
		target: number,
		params: Tween.Parameters,
		dt_s: number
	) {
		let dx = target - params.x0;
		let t = (performance.now() - params.t0_ms) / 1000;
		let u = t / params.duration_s;
		let x_new = params.x0 + dx * u * u * (3 - 2 * u);
		object[field] = x_new;
	}

	export function easeInStep(
		object: any,
		field: FieldKey,
		target: number,
		params: Tween.Parameters,
		dt_s: number
	) {
		let dx = target - params.x0;
		let t = (performance.now() - params.t0_ms) / 1000;
		let u = t / params.duration_s;
		let x_new = params.x0 + dx * u * u * u;
		object[field] = x_new;
	}

	export function easeOutStep(
		object: any,
		field: FieldKey,
		target: number,
		params: Tween.Parameters,
		dt_s: number
	) {
		let dx = target - params.x0;
		let t = (performance.now() - params.t0_ms) / 1000;
		let u = t / params.duration_s;
		let x_new = params.x0 + dx * (1 - Math.pow(1 - u, 3));
		object[field] = x_new;
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
