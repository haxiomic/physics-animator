import { useRef } from "react";
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
        let value = structuredClone(options.initial);
        return {
            get value() {
                return value;
            },
            set value(newValue: T) {
                value = newValue;
                onChange(value);
            },
        };
    });

    const afterStepListener = useRef<{ remove:() => void } | null>(null);
    
    switch (typeof options.initial) {
        case 'number': {
            animator.springTo(
                springValue,
                'value',
                options.target as any,
                options
            );
        } break;
        default: {
            if (Array.isArray(options.initial)) {
                for (let i = 0; i < options.initial.length; i++) {
                    animator.springTo(
                        springValue.value as number[],
                        i,
                        (options.target as number[])[i],
                        options
                    );
                }
            } else {
                // assume object, iterate over keys
                for (const key in options.initial) {
                    animator.springTo(
                        springValue.value,
                        key,
                        (options.target as any)[key],
                        options
                    );
                }
            }

            if (!afterStepListener.current) {
                afterStepListener.current = animator.onAfterStep.addListener(() => {
                    onChange(springValue.value);
                });
                animator.onAllComplete(springValue.value, () => {
                    afterStepListener.current?.remove();
                    afterStepListener.current = null;
                }, 'once');
            }

        } break;
    }
}