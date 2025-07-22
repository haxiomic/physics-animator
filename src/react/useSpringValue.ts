import { useInitializer } from "use-initializer";
import { Animator } from "../Animator.js";
import { useAnimator } from "./useAnimator.js";
import { useEffect } from "react";
import { SpringParameters } from "../animators/SpringAnimator.js";

/**
 * A value that animates to a target value using a spring animation.
 * This will **not** cause a re-render when the value changes.
 * 
 * See {@link useSpringState} for a version that does cause re-renders.
 */
export function useSpringValue<T extends number | number[] | { [field: PropertyKey]: number }>(
    options: {
        animator?: Animator,
        initial: T;
        target: T;
    } & SpringParameters,
    onChange: (value: T) => void
) {

    const animator = useAnimator(options.animator);

    const springValue = useInitializer(() => {
        return {
            value: structuredClone(options.initial),
        };
    });

    useEffect(() => {
        let remove = animator.onChange(springValue, () => {
            onChange(springValue.value);
        }).remove;
        return () => {
            remove();
        }
    }, [springValue, onChange]);

    animator.springTo(
        springValue,
        { value: options.target  },
        options
    );

}