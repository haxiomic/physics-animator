import { EventSignal } from "@haxiomic/event-signal";
import { Spring, SpringParameters } from "./Spring.js";

enum AnimationType {
	Spring = 0,
	Tween,
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
	}
	protected _onFieldAnimationComplete = new EventSignal<{object: any, field: string | number | symbol}>();
	protected _onObjectAnimationsComplete = new EventSignal<{object: any}>();

	fieldAnimations = new Map<any, Map<string | number | symbol, {
		target: number,
		type: AnimationType,
		springParams: Spring.PhysicsParameters | null,
		tweenParams: Tween.Parameters | null,
		step: TweenStepFn | null,
		velocity: number,
	}>>();

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
		target: { [Name in keyof Obj]: Obj[Name] }
	): void {
		forObjectFieldsRecursive(object, target, (obj, field, targetValue) => {
			this.setFieldTo(obj, field, targetValue);
		});
	}

	customTweenTo<Obj>(
		object: Obj,
		target: { [Name in keyof Obj]: Obj[Name] & number },
		duration_s: number,
		step: TweenStepFn
	): void {
		forObjectFieldsRecursive(object, target, (obj, field, targetValue) => {
			this.customTweenFieldTo(obj, field, targetValue as number, duration_s, step);
		});
	}

	linearTo<Obj>(
		object: Obj,
		target: { [Name in keyof Obj]: Obj[Name] & number },
		duration_s: number
	): void {
		this.customTweenTo(object, target, duration_s, Tween.linearStep);
	}

	easeInOutTo<Obj>(
		object: Obj,
		target: { [Name in keyof Obj]: Obj[Name] & number },
		duration_s: number
	): void {
		this.customTweenTo(object, target, duration_s, Tween.easeInOutStep);
	}

	easeInTo<Obj>(
		object: Obj,
		target: { [Name in keyof Obj]: Obj[Name] & number },
		duration_s: number
	): void {
		this.customTweenTo(object, target, duration_s, Tween.easeInStep);
	}

	easeOutTo<Obj>(
		object: Obj,
		target: { [Name in keyof Obj]: Obj[Name] & number },
		duration_s: number
	): void {
		this.customTweenTo(object, target, duration_s, Tween.easeOutStep);
	}

	onCompleteField<Obj, Name extends keyof Obj>(object: Obj, field: Name, callback: (object: Obj, field: Name) => void) {
		return this._onFieldAnimationComplete.addListener(e => {
			if (e.object === object && e.field === field) {
				callback(object, field);
			}
		});
	}

	onComplete<Obj>(object: Obj, callback: (object: Obj) => void, once?: 'once') {
		let listener = this._onObjectAnimationsComplete.addListener(e => {
			if (e.object === object) {
				callback(object);
				if (once) {
					listener.remove();
				}
			}
		});
		return listener;
	}

	private _springState = { x: 0, targetX: 0, v: 0 };
	step(dt_s: number) {
		if (this.events.beforeStep.hasListeners()) {
			this.events.beforeStep.dispatch({dt_s});
		}
		let springState = this._springState

		// step all animations
		this.fieldAnimations.forEach((objectAnims, object) => {
			objectAnims.forEach((animation, field) => {
				switch (animation.type) {
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
							this._onFieldAnimationComplete.dispatch({object, field});
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
							this._onFieldAnimationComplete.dispatch({object, field});
						}
						break;
					}
				}
			});

			// remove the object if it has no more springs
			if (objectAnims.size == 0) {
				this.fieldAnimations.delete(object);
				this._onObjectAnimationsComplete.dispatch({object});
			}
		});

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
	remove<T>(object: T, field: keyof T) {
		let objectSprings = this.fieldAnimations.get(object);
		if (objectSprings != null) {
			objectSprings.delete(field);
		}
		// if there are no more springs for this object, remove it from the map
		if (objectSprings != null && objectSprings.size == 0) {
			this.fieldAnimations.delete(object);
		}
	}

	/**
	 * Remove all animations for this object
	 */
	removeObject(object: any) {
		this.fieldAnimations.delete(object);
	}

	/**
	 * Remove all animations
	 */
	removeAll() {
		this.fieldAnimations.clear();
	}

	getVelocity<Obj, Name extends keyof Obj>(object: Obj, field: Name) {
		let spring = this.getObjectAnimations(object).get(field);
		return spring?.velocity ?? 0;
	}

	protected springFieldTo<Obj, Name extends keyof Obj>(
		object: Obj,
		field: Name,
		targetValue: Obj[Name] & number,
		params: SpringParameters | null = { duration_s: 0.5 }
	) {
		if (params != null) {
			let spring = this.getAnimationOrCreate(object, field, AnimationType.Spring);
			// update the target and parameters
			spring.type = AnimationType.Spring;
			spring.target = targetValue;
			spring.springParams = Spring.getPhysicsParameters(params);
			spring.step = null;
		} else {
			this.setFieldTo(object, field, targetValue);
		}
	}

	/**
	* Remove animation from the object and set the field to the target value
	*/
	protected setFieldTo<Obj, Name extends keyof Obj, T extends Obj[Name]>(
		object: Obj,
		field: Name,
		targetValue: T
	) {
		this.remove(object, field);
		object[field] = targetValue;
	}

	protected customTweenFieldTo<Obj, Name extends keyof Obj>(
		object: Obj,
		field: Name,
		targetValue: Obj[Name] & number,
		duration_s: number, step: TweenStepFn
	) {
		let animation = this.getAnimationOrCreate(object, field, AnimationType.Tween);
		animation.type = AnimationType.Tween;
		animation.target = targetValue;
		animation.tweenParams = {
			x0: object[field] as number,
			t0_ms: performance.now(),
			duration_s: duration_s,
		}
		animation.step = step;
	}

	/**
	 * Creates a new map if one doesn't already exist for the given object
	 */
	private getObjectAnimations(object: any) {
		let objectAnimations = this.fieldAnimations.get(object);
		if (objectAnimations == null) {
			// create
			objectAnimations = new Map();
			this.fieldAnimations.set(object, objectAnimations);
		}
		return objectAnimations;
	}

	/**
	 * Creates a new spring if one doesn't already exist for the given object and field
	 */
	private getAnimationOrCreate(object: any, field: string | number | symbol, type: AnimationType) {
		let objectAnimations = this.getObjectAnimations(object);
		let animation = objectAnimations.get(field);
		if (animation == null) {
			// create
			animation = {
				target: 0,
				type: type,
				springParams: null,
				tweenParams: null,
				velocity: 0,
				step: null
			};
			objectAnimations.set(field, animation);
		}
		animation.type = type;
		return animation;
	}

}

export type TweenStepFn = (object: any, field: string | number | symbol, target: number, params: Tween.Parameters, dt_s: number) => void;

export namespace Tween {

	export type Parameters = {
		x0: number,
		t0_ms: number,
		duration_s: number,
	}

	export function linearStep(
		object: any,
		field: string | number | symbol,
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
		field: string | number | symbol,
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
		field: string | number | symbol,
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
		field: string | number | symbol,
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
	callback: (obj: any, field: string, targetValue: any) => void
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