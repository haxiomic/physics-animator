import { useInitializer } from "use-initializer";
import { Animator } from "../Animator.js";
import { useAnimator } from "./useAnimator.js";
import { useEffect } from "react";
import { SpringParameters } from "../animators/SpringAnimator.js";

type SpringOptions<T> = {
    animator?: Animator,
    initial?: T,
} & SpringParameters;

/**
 * A value that animates to a target value using a spring animation.
 * This will **not** cause a re-render when the value changes.
 * 
 * Usage example:
 * ```tsx
 * useSpringValue(
 *    1,
 *    { initial: 0, duration_s: 0.8 },
 *    // onChange
 *    value => el.style.opacity = value
 * );
 * ```
 * 
 * Or with default options:
 * ```tsx
 * useSpringValue(1, value => el.style.opacity = value);
 * ```
 * 
 * See {@link useSpringState} for a version that does cause re-renders.
 */
export function useSpringValue<T extends number | number[] | { [field: PropertyKey]: number }>(
    value: T,
    onChange: (value: T) => void
): void;
export function useSpringValue<T extends number | number[] | { [field: PropertyKey]: number }>(
    value: T,
    options: SpringOptions<T>,
    onChange: (value: T) => void
): void;
export function useSpringValue<T extends number | number[] | { [field: PropertyKey]: number }>(
    value: T,
    optionsOrOnChange: SpringOptions<T> | ((value: T) => void),
    maybeOnChange?: (value: T) => void
) {
    const options: SpringOptions<T> = typeof optionsOrOnChange === 'function' 
        ? { duration_s: 0.5 } 
        : optionsOrOnChange;
    const onChange = typeof optionsOrOnChange === 'function' 
        ? optionsOrOnChange 
        : maybeOnChange!;

    const animator = useAnimator(options.animator);

    const springObject = useInitializer(() => ({ value: options.initial ?? value }));

    useEffect(() =>
        animator.onChange(
            springObject,
            () => onChange(springObject.value)
        ).remove // return the cleanup function
    , [springObject, onChange]);

    animator.springTo(
        springObject,
        { value },
        options
    );
}