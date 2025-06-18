import { IFieldAnimator, StepResult } from "../IFieldAnimator.js";

export type TweenParameters = {
	duration_s: number, // duration of the tween in seconds
	easingFn: EasingStepFn, // easing function to use for the tween
}

const defaultParams = {
	duration_s: 0.5, // default duration of the tween in seconds
	easingFn: linearStep, // default easing function is linear
}

export const TweenAnimator: IFieldAnimator<TweenParameters, TweenState, number> = {

	createState(obj, field, target, params) {
		return {
			x0: obj[field], // initial value of the field
			t0_ms: performance.now(), // time when the tween started in milliseconds
			target: target,
			velocity: 0,
			...(params ?? defaultParams),
		}
	},

	updateState(state, object, field, target, params) {
		state.target = target;
		state.x0 = object[field]; // update the initial value of the field
		state.t0_ms = performance.now(); // reset the start time of the tween
		state.duration_s = params?.duration_s ?? defaultParams.duration_s; // update the duration of the tween
		state.easingFn = params?.easingFn ?? defaultParams.easingFn; //
	},

	step(state, object, field, params, dt_s) {
		// step the tween
		let x = object[field];

		params.easingFn(
			object,
			field,
			state.target,
			state,
			dt_s
		);
	
		let x_new = object[field];
		state.velocity = (x_new - x) / dt_s;

		// remove the tween if it's complete
		let deltaTime_s = (performance.now() - state.t0_ms) / 1000;
		if (deltaTime_s >= state.duration_s) {
			(object[field] as number) = state.target;
			return StepResult.Complete;
		} else {
			return StepResult.Continue;
		}
	}

}

type TweenState = {
	x0: number, // initial value of the field
	t0_ms: number, // time when the tween started in milliseconds
	target: number,
	duration_s: number, // duration of the tween in seconds
	easingFn: EasingStepFn, // easing function to use for the tween
	velocity: number,
}

type FieldKey = string | number | symbol;

export type EasingStepFn = (object: any, field: FieldKey, target: number, state: TweenState, dt_s: number) => void;

export function linearStep(
	object: any,
	field: FieldKey,
	target: number,
	params: TweenState,
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
	params: TweenState,
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
	params: TweenState,
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
	params: TweenState,
	dt_s: number
) {
	let dx = target - params.x0;
	let t = (performance.now() - params.t0_ms) / 1000;
	let u = t / params.duration_s;
	let x_new = params.x0 + dx * (1 - Math.pow(1 - u, 3));
	object[field] = x_new;
}
