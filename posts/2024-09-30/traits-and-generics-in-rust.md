---
title: Traits and Generics in RUST
date: 2024-09-30
tags: [RUST]
---


Every programming language has tools for effectively **handling the duplication of concepts.** In Rust, one such tool is  _generics_ : abstract stand-ins for concrete types or other properties. We can express the behavior of generics or how they relate to other generics without knowing what will be in their place when compiling and running the code.

Functions can take parameters of some generic type, instead of a concrete type like `i32` or `String`, in the same way they take parameters with unknown values to run the same code on multiple concrete values. In fact, we’ve already used generics in Chapter 6 with `Option<T>`, in Chapter 8 with `Vec<T>` and `HashMap<K, V>`, and in Chapter 9 with `Result<T, E>`. In this chapter, you’ll explore how to define your own types, functions, and methods with generics!

## Traits

  * **定义** : Trait 是 Rust 中的一种共享行为定义，可以看作是接口的实现。它定义了一组方法，可以被多个不同类型实现。

  * **用途** : Trait 允许你定义通用行为，比如 `Clone`、`Debug` 等，类型可以通过实现这些 Trait 来具备特定的行为。

  * **实现** : 使用 `impl` 关键字实现 Trait。例如：


    
    trait Speak {
    fn speak(&self);
}
struct Dog;
impl Speak for Dog {
    fn speak(&self) {
        println!("Woof!");
    }
}
