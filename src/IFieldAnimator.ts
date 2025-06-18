export enum StepResult {
	Continue = 0, // continue stepping
	Complete, // complete the animation
}

export interface IFieldAnimator<Params, State, FieldType> {

    createState<
        Name extends keyof Obj,
        Obj extends Record<Name, FieldType>
    >(
        object: Obj,
        field: Name,
        target: Obj[Name],
        params: Params | null
    ): State;

    updateState<
        Name extends keyof Obj,
        Obj extends Record<Name, FieldType>
    >(
        state: State,
        object: Obj,
        field: Name,
        target: Obj[Name],
        params: Params | null
    ): void;

    step<
        Name extends keyof Obj,
        Obj extends Record<Name, FieldType>
    >(
        state: State,
        object: Obj,
        field: Name,
        params: Params,
        dt_s: number
    ): StepResult;

}