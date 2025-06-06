# Physics Animator

A TypeScript animation system grounded in physics with three.js and react support.

Why use this over other animation systems?

This library focuses on simplicity and correctness – I've generally run into design troubles with popular animation libraries like framer motion: for example complex framer animations become convoluted and don't correctly handled interruptions without discontinuities in velocity

For example in react, to animate opacity we could do

```tsx
useSpringValue(
    { initial: 0, target: 1, duration_s: 0.8 },
    value => el.style.opacity = value
)
```

Or via state

```tsx
const opacity = useSpringState({ initial: 0, target: 1, duration_s: 0.8 })

return <div style={opacity} />
```

It works with arrays and objects

```tsx
const rgb = useSpringState({ initial: [0, 0, 0], target: [1, 0, 0], duration_s: 0.8 })
const xy = useSpringState({ initial: { x: 0, y: 0 }, target: {x: mouse.x, y: mouse.y}, duration_s: 0.1 })
```

Outside of react we use the animator object

```ts
const animator = new Animator();
animator.startAnimationFrameLoop();

animator.springTo(character, 'opacity', 1, { duration_s: 0.8 })
```

We can animate three objects like vectors:

```ts
animator.springTo(character, 'rotation', new Quaternion(), { duration_s: 2 })
```

Velocity state is stored within the animator object

Tweens are also supported