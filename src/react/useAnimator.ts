import { useEffect } from "react";
import { Animator } from "../Animator.js";
import { useInitializer } from "use-initializer";

/**
 * Returns an instance of Animator running an interval loop
 * @param interval_ms interval between animation steps, pass explicit `null` to disable / stop. Defaults to `animationFrame`
 * @returns { Animator } instance of Animator
 */
export function useAnimator(interval_ms?: number | null | 'animationFrame'): Animator;
/**
 * Returns the same instance of Animator that is passed in, or creates a new one if not provided.
 * @param animator an instance of Animator to use, will not create a new one
 */
export function useAnimator(animator?: Animator): Animator;
export function useAnimator(input: number | null | 'animationFrame' | Animator = 'animationFrame'): Animator {
	if (input instanceof Animator) {
		return input; // return the animator instance directly
	}

	const interval_ms = input;

	const animator = useInitializer(
		() => new Animator(),
		(animator) => {
			animator.stop();
			animator.removeAll();
		}
	);

	// react to change of interval handling
	useEffect(() => {
		animator.stop();
		
		if (interval_ms !== null) {
			if (interval_ms === 'animationFrame') {
				animator.startAnimationFrameLoop();
			} else {
				animator.startIntervalLoop(interval_ms);
			}
		}
	}, [animator, interval_ms])

	return animator;
}