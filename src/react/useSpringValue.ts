import { Animator } from "../Animator.js";
import { Spring, SpringParameters } from "../Spring.js";
import { useAnimator } from "./useAnimator.js";
import { useInitializer } from "use-initializer";

/**
 * A value that animates to a target value using a spring animation.
 * This will **not** cause a re-render when the value changes.
 * 
 * See {@link useSpringState} for a version that does cause re-renders.
 */
export function useSpringValue(
    options: {
        animator?: Animator,
        initial: number;
        target: number;
    } & SpringParameters,
    onChange: (value: number) => void
) {
    const animator = useAnimator(options.animator);

    const springValue = useInitializer(() => {
        let value = options.initial;
        return {
            get value() {
                return value;
            },
            set value(newValue: number) {
                value = newValue;
                onChange(value);
            },
        };
    });

    animator.springTo(
        springValue,
        'value',
        options.target,
        options
    );
}