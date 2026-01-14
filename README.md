# Physics Animator

A TypeScript animation system grounded in physics with three.js and react support.

<div align="center">
  <a href="https://haxiomic.github.io/physics-animator/">
    <img width="759" alt="Screenshot 2025-06-19 at 10 56 58" src="https://github.com/user-attachments/assets/3c8c4684-75fd-491f-a4ab-ece9aca4c327" />
  </a>
</div>

Why use this over other animation systems?

This library focuses on simplicity and correctness – I've generally run into design troubles with popular animation libraries like framer motion: for example complex framer animations become convoluted and don't correctly handled interruptions without discontinuities in velocity

For example in react, to animate DOM opacity we could do

```tsx
useSpringValue(
    1.0, // target
    { duration_s: 0.8 },
    value => el.style.opacity = value // onChange
)
```

Or via state

```tsx
const opacitySpring = useSpringState(opacity, { duration_s: 0.8 })

return <div style={{ opacity: opacitySpring }} />
```

It works with arrays and objects

```tsx
const rgb = useSpringState([1, 0, 0], { initial: [0, 0, 0], duration_s: 0.8 })
const xy = useSpringState({x: mouse.x, y: mouse.y})
```

Outside of react we use the animator object

```ts
const animator = new Animator();
animator.startAnimationFrameLoop();

animator.springTo(character, { opacity: 1 }, { duration_s: 0.8, bounce: 1 })
```

We can animate nested fields

```ts
animator.springTo(character, { position: { x, y, z } }, { duration_s: 2 })
```

And get notified of changes, even if they're nested within the object

```ts
animator.springTo(character.color, { rgb: [1, 0, 0] }, { duration_s: 2 })

// will fire if any property within character is changed by the animator
animator.onChange(character, () => render());
```

Velocity state is stored within the animator object

Tweens are also supported
