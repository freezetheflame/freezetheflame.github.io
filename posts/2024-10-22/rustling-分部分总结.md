---
title: rustling 分部分总结
date: 2024-10-22
tags: [RUST]
---

\n

## Primitives

\n\n\n\n

在rust中有以下基本类型，很神奇的是rust乐意声明出一个类型的宽度，以更方便进行维护

\n\n\n\n

### [Scalar Types](<https://doc.rust-lang.org/rust-by-example/primitives.html#scalar-types>)

\n\n\n\n

\n
  * Signed integers: `i8`, `i16`, `i32`, `i64`, `i128` and `isize` (pointer size)
\n\n\n\n
  * Unsigned integers: `u8`, `u16`, `u32`, `u64`, `u128` and `usize` (pointer size)
\n\n\n\n
  * Floating point: `f32`, `f64`
\n\n\n\n
  * `char` Unicode scalar values like `'a'`, `'α'` and `'∞'` (4 bytes each)
\n\n\n\n
  * `bool` either `true` or `false`
\n\n\n\n
  * The unit type `()`, whose only possible value is an empty tuple: `()`
\n
\n\n\n\n

Despite the value of a unit type being a tuple, it is not considered a compound type because it does not contain multiple values.

\n\n\n\n

### [Compound Types](<https://doc.rust-lang.org/rust-by-example/primitives.html#compound-types>)

\n\n\n\n

\n
  * Arrays like `[1, 2, 3]`
\n\n\n\n
  * Tuples like `(1, true)`
\n
\n\n\n\n

Variables can always be _type annotated_. Numbers may additionally be annotated via a _suffix_  or _by default_. Integers default to `i32` and floats to `f64`. Note that Rust can also infer types from context.

\n\n\n\n

简单来讲就是rust既可以进行类型推断，也可以通过后缀进行注释，整数默认i32，浮点默认f64

\n\n\n\n

## [Custom Types](<https://doc.rust-lang.org/stable/rust-by-example/custom_types.html#custom-types>)

\n\n\n\n

Rust custom data types are formed mainly through the two keywords:

\n\n\n\n

\n
  * `struct`: define a structure
\n\n\n\n
  * `enum`: define an enumeration
\n
\n\n\n\n

rust并非java和c++意义上的OOP语言，因此所有的封装其实也是一种custom types,基本都围绕着以上两种类型进行，并且辅助以methods，traits等特性实现这样一个内容，并且rust的动态派发特性使得rust可以在运行时选择合适的实现

\n\n\n\n

让我们具体来看一下在rust中的struct以及enum的特点：

\n\n\n\n

### Struct

\n\n\n\n

There are three types of structures ("structs") that can be created using the `struct` keyword:

\n\n\n\n

\n
  * Tuple structs, which are, basically, named tuples.
\n\n\n\n
  * The classic [C structs](<https://en.wikipedia.org/wiki/Struct_\(C_programming_language\)>)
\n\n\n\n
  * Unit structs, which are field-less, are useful for generics.
\n
\n\n\n\n
    
    
    struct Rectangle {\n    // A rectangle can be specified by where the top left and bottom right\n    // corners are in space.\n    top_left: Point,\n    bottom_right: Point,\n}

\n\n\n\n

这样定义之后，在使用时候，我们可以建立类似于下文这样的struct

\n\n\n\n
    
    
    let another_point: Point = Point { x: 5.2, y: 0.2 };

\n\n\n\n

并且为了方便初始化并且使用update语法更新部分，可以这样去定义struct

\n\n\n\n
    
    
    fn create_order_template() -> Order {\n    Order {\n        name: String::from("Bob"),\n        year: 2019,\n        made_by_phone: false,\n        made_by_mobile: false,\n        made_by_email: true,\n        item_number: 123,\n        count: 0,\n    }\n}\n\nlet order_template = create_order_template();\n        // TODO: Create your own order using the update syntax and template above!\n        let your_order = Order{\n            count: 1,\n            item_number: 1,\n            name: "Hacker in Rust".to_string(),\n            ..order_template\n        };

\n\n\n\n

最重要的特征之一，我们可以给这样一般的c structs添加实例方法，如下：

\n\n\n\n
    
    
    struct Package {\n    sender_country: String,\n    recipient_country: String,\n    weight_in_grams: i32,\n}\n\nimpl Package {\n    fn new(sender_country: String, recipient_country: String, weight_in_grams: i32) -> Package {\n        if weight_in_grams <= 0 {\n            panic!("Can not ship a weightless package.")\n        } else {\n            Package {\n                sender_country,\n                recipient_country,\n                weight_in_grams,\n            }\n        }\n    }\n\n    fn is_international(&self) -> bool {\n        if self.sender_country != self.recipient_country {\n            true\n        } else {\n            false\n        }\n    }\n\n    fn get_fees(&self, cents_per_gram: i32) -> i32 {\n        self.weight_in_grams * cents_per_gram\n    }\n}

\n\n\n\n

### [Enums](<https://doc.rust-lang.org/stable/rust-by-example/custom_types/enum.html#enums>)

\n\n\n\n

The `enum` keyword allows the creation of a type which may be one of a few different variants. Any variant which is valid as a `struct` is also valid in an `enum`.

\n\n\n\n
    
    
    enum Message {\n    Quit,\n    Echo,\n    Move,\n    ChangeColor\n}

\n\n\n\n

这是一个最简单的enum类型，也是类似于其他语言的enum设计类型，但是实际上rust 的enum类型支持更加丰富的扩展，在enum中可以存储其他类型的数据：  


\n\n\n\n
    
    
    enum Message {\n    Move{x: i32, y: i32},\n    Echo(String),\n    ChangeColor(i32, i32, i32),\n    Quit\n}

\n\n\n\n

并且和rust一样支持实例化的方法

\n\n\n\n
    
    
    impl Message {\n    fn call(&self) {\n        println!("{:?}", self);\n    }\n}

\n\n\n\n

并且结合match可以做到简单的“多态”

\n\n\n\n
    
    
    enum Message {\n    // TODO: implement the message variant types based on their usage below\n    Quit,\n    Echo(String),\n    Move(Point),\n    ChangeColor(u8, u8, u8)\n}\n\nstruct Point {\n    x: u8,\n    y: u8,\n}\n\nstruct State {\n    color: (u8, u8, u8),\n    position: Point,\n    quit: bool,\n    message: String\n}\n\nimpl State {\n    fn change_color(&mut self, color: (u8, u8, u8)) {\n        self.color = color;\n    }\n\n    fn quit(&mut self) {\n        self.quit = true;\n    }\n\n    fn echo(&mut self, s: String) { self.message = s }\n\n    fn move_position(&mut self, p: Point) {\n        self.position = p;\n    }\n\n    fn process(&mut self, message: Message) {\n        // TODO: create a match expression to process the different message\n        // variants\n        // Remember: When passing a tuple as a function argument, you'll need\n        // extra parentheses: fn function((t, u, p, l, e))\n        match message {\n            Message::Quit => self.quit(),\n            Message::Echo(s) => self.echo(s),\n            Message::Move(p) => self.move_position(p),\n            Message::ChangeColor(r, g, b) => self.change_color((r, g, b))\n        }\n    }\n}

\n\n\n\n

## [Variable Bindings](<https://doc.rust-lang.org/rust-by-example/variable_bindings.html#variable-bindings>)

\n\n\n\n
    
    
        let an_integer = 1u32;\n    let a_boolean = true;\n    let unit = ();\n\n    // copy `an_integer` into `copied_integer`\n    let copied_integer = an_integer;\n\n    println!("An integer: {:?}", copied_integer);\n    println!("A boolean: {:?}", a_boolean);\n    println!("Meet the unit value: {:?}", unit);

\n\n\n\n

### [Mutability](<https://doc.rust-lang.org/stable/rust-by-example/variable_bindings/mut.html#mutability>)

\n\n\n\n

Variable bindings are immutable by default, but this can be overridden using the `mut` modifier.

\n\n\n\n

在默认情况下这里的变量绑定之后都是不能更改的

\n\n\n\n

Variable bindings have a scope, and are constrained to live in a  _block_. A block is a collection of statements enclosed by braces `{}` 即有关域的内容，允许shadowing的行为（即小定义域内的变量>大定义域）

\n\n\n\n

It's possible to declare variable bindings first, and initialize them later. However, this form is seldom used, as it may lead to the use of uninitialized variables.（只声明不初始化不是好习惯）

\n\n\n\n

## [Types](<https://doc.rust-lang.org/stable/rust-by-example/types.html#types>)

\n\n\n\n

Rust provides several mechanisms to change or define the type of primitive and user defined types. The following sections cover:

\n\n\n\n

\n
  * [Casting](<https://doc.rust-lang.org/stable/rust-by-example/types/cast.html>) between primitive types
\n\n\n\n
  * Specifying the desired type of [literals](<https://doc.rust-lang.org/stable/rust-by-example/types/literals.html>)
\n\n\n\n
  * Using [type inference](<https://doc.rust-lang.org/stable/rust-by-example/types/inference.html>)
\n\n\n\n
  * [Aliasing](<https://doc.rust-lang.org/stable/rust-by-example/types/alias.html>) types
\n
\n\n\n\n

Rust provides no implicit type conversion (coercion) between primitive types. But, explicit type conversion (casting) can be performed using the `as` keyword.

\n\n\n\n

虽然不允许隐式转换，但是使用as作为关键字是可以进行显式转换的。

\n\n\n\n
    
    
    // Suppress all warnings from casts which overflow.\n#![allow(overflowing_literals)]\n\nfn main() {\n    let decimal = 65.4321_f32;\n\n    // Error! No implicit conversion\n    let integer: u8 = decimal;\n    // FIXME ^ Comment out this line\n\n    // Explicit conversion\n    let integer = decimal as u8;\n    let character = integer as char;\n\n    // Error! There are limitations in conversion rules.\n    // A float cannot be directly converted to a char.\n    let character = decimal as char;\n    // FIXME ^ Comment out this line\n\n    println!("Casting: {} -> {} -> {}", decimal, integer, character);\n\n    // when casting any value to an unsigned type, T,\n    // T::MAX + 1 is added or subtracted until the value\n    // fits into the new type\n\n    // 1000 already fits in a u16\n    println!("1000 as a u16 is: {}", 1000 as u16);\n\n    // 1000 - 256 - 256 - 256 = 232\n    // Under the hood, the first 8 least significant bits (LSB) are kept,\n    // while the rest towards the most significant bit (MSB) get truncated.\n    println!("1000 as a u8 is : {}", 1000 as u8);\n    // -1 + 256 = 255\n    println!("  -1 as a u8 is : {}", (-1i8) as u8);\n\n    // For positive numbers, this is the same as the modulus\n    println!("1000 mod 256 is : {}", 1000 % 256);\n\n    // When casting to a signed type, the (bitwise) result is the same as\n    // first casting to the corresponding unsigned type. If the most significant\n    // bit of that value is 1, then the value is negative.\n\n    // Unless it already fits, of course.\n    println!(" 128 as a i16 is: {}", 128 as i16);\n\n    // In boundary case 128 value in 8-bit two's complement representation is -128\n    println!(" 128 as a i8 is : {}", 128 as i8);\n\n    // repeating the example above\n    // 1000 as u8 -> 232\n    println!("1000 as a u8 is : {}", 1000 as u8);\n    // and the value of 232 in 8-bit two's complement representation is -24\n    println!(" 232 as a i8 is : {}", 232 as i8);\n\n    // Since Rust 1.45, the `as` keyword performs a *saturating cast*\n    // when casting from float to int. If the floating point value exceeds\n    // the upper bound or is less than the lower bound, the returned value\n    // will be equal to the bound crossed.\n\n    // 300.0 as u8 is 255\n    println!(" 300.0 as u8 is : {}", 300.0_f32 as u8);\n    // -100.0 as u8 is 0\n    println!("-100.0 as u8 is : {}", -100.0_f32 as u8);\n    // nan as u8 is 0\n    println!("   nan as u8 is : {}", f32::NAN as u8);\n\n    // This behavior incurs a small runtime cost and can be avoided\n    // with unsafe methods, however the results might overflow and\n    // return **unsound values**. Use these methods wisely:\n    unsafe {\n        // 300.0 as u8 is 44\n        println!(" 300.0 as u8 is : {}", 300.0_f32.to_int_unchecked::<u8>());\n        // -100.0 as u8 is 156\n        println!("-100.0 as u8 is : {}", (-100.0_f32).to_int_unchecked::<u8>());\n        // nan as u8 is 0\n        println!("   nan as u8 is : {}", f32::NAN.to_int_unchecked::<u8>());\n    }\n}

\n\n\n\n

The type inference engine is pretty smart. It does more than looking at the type of the value expression during an initialization. It also looks at how the variable is used afterwards to infer its type. Here's an advanced example of type inference:rust实际上的类型推断有如下的实现

\n\n\n\n
    
    
    fn main() {\n    // Because of the annotation, the compiler knows that `elem` has type u8.\n    let elem = 5u8;\n\n    // Create an empty vector (a growable array).\n    let mut vec = Vec::new();\n    // At this point the compiler doesn't know the exact type of `vec`, it\n    // just knows that it's a vector of something (`Vec<_>`).\n\n    // Insert `elem` in the vector.\n    vec.push(elem);\n    // Aha! Now the compiler knows that `vec` is a vector of `u8`s (`Vec<u8>`)\n    // TODO ^ Try commenting out the `vec.push(elem)` line\n    \n    println!("{:?}", vec);\n}

\n\n\n\n

The `type` statement can be used to give a new name to an existing type. Types must have `**UpperCamelCase**` names, or the compiler will raise a warning

\n\n\n\n

可以使用type NewType = existingtype这样的语法来给类型赋予新名字（alias）

\n\n\n\n

### From

\n\n\n\n

## [`From`](<https://doc.rust-lang.org/stable/rust-by-example/conversion/from_into.html#from>)

\n\n\n\n

The [`From`](<https://doc.rust-lang.org/std/convert/trait.From.html>) trait allows for a type to define how to create itself from another type, hence providing a very simple mechanism for converting between several types. There are numerous implementations of this trait within the standard library for conversion of primitive and common types.

\n\n\n\n

For example we can easily convert a `str` into a `String`

\n\n\n\n
    
    
    let my_str = "hello";\nlet my_string = String::from(my_str);

\n\n\n\n

对于没有默认实现的，我们可以通过如下方式声明这样的from转换

\n\n\n\n
    
    
    use std::convert::From;\n\n#[derive(Debug)]\nstruct Number {\n    value: i32,\n}\n\nimpl From<i32> for Number {\n    fn from(item: i32) -> Self {\n        Number { value: item }\n    }\n}\n\nfn main() {\n    let num = Number::from(30);\n    println!("My number is {:?}", num);\n}

\n\n\n\n

## [`Into`](<https://doc.rust-lang.org/stable/rust-by-example/conversion/from_into.html#into>)

\n\n\n\n

The [`Into`](<https://doc.rust-lang.org/std/convert/trait.Into.html>) trait is simply the reciprocal of the `From` trait. It defines how to convert a type into another type.

\n\n\n\n

Calling `into()` typically requires us to specify the result type as the compiler is unable to determine this most of the time.

\n\n\n\n

`From` and `Into` are designed to be complementary

\n\n\n\n
    
    
    use std::convert::Into;\n\n#[derive(Debug)]\nstruct Number {\n    value: i32,\n}\n\nimpl Into<Number> for i32 {\n    fn into(self) -> Number {\n        Number { value: self }\n    }\n}\n\nfn main() {\n    let int = 5;\n    // Try removing the type annotation\n    let num: Number = int.into();//we should declare the annotation\n    println!("My number is {:?}", num);\n}

\n\n\n\n

### [Converting to String](<https://doc.rust-lang.org/stable/rust-by-example/conversion/string.html#converting-to-string>)

\n\n\n\n

To convert any type to a `String` is as simple as implementing the [`ToString`](<https://doc.rust-lang.org/std/string/trait.ToString.html>) trait for the type. Rather than doing so directly, you should**implement the[`fmt::Display`](<https://doc.rust-lang.org/std/fmt/trait.Display.html>) trait** which automagically provides [`ToString`](<https://doc.rust-lang.org/std/string/trait.ToString.html>) and also allows printing the type as discussed in the section on [`print!`](<https://doc.rust-lang.org/stable/rust-by-example/hello/print.html>).

\n\n\n\n
    
    
    use std::fmt;\n\nstruct Circle {\n    radius: i32\n}\n\nimpl fmt::Display for Circle {\n    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {\n        write!(f, "Circle of radius {}", self.radius)\n    }\n}\n\nfn main() {\n    let circle = Circle { radius: 6 };\n    println!("{}", circle.to_string());\n}

\n\n\n\n

### Expressions

\n\n\n\n

关于rust的表达式，其实只要下面的例子就能略知一二

\n\n\n\n
    
    
    fn main() {\n    let x = 5u32;\n\n    let y = {\n        let x_squared = x * x;\n        let x_cube = x_squared * x;\n\n        // This expression will be assigned to `y`\n        x_cube + x_squared + x\n    };\n\n    let z = {\n        // The semicolon suppresses this expression and `()` is assigned to `z`\n        2 * x;\n    };\n\n    println!("x is {:?}", x);\n    println!("y is {:?}", y);\n    println!("z is {:?}", z);\n}

\n\n\n\n

## Flow of Control

\n\n\n\n

### if-else

\n\n\n\n

Branching with `if`-`else` is similar to other languages. Unlike many of them, the boolean condition doesn't need to be surrounded by parentheses, and each condition is followed by a block. `if`-`else` conditionals are expressions, and, all branches must return the same type.

\n\n\n\n

在rust中万物皆expr,所以对于一个ifelse语句来讲也可以这样

\n\n\n\n
    
    
    fn main() {\n    let n = 5;\n\n    if n < 0 {\n        print!("{} is negative", n);\n    } else if n > 0 {\n        print!("{} is positive", n);\n    } else {\n        print!("{} is zero", n);\n    }\n\n    let big_n =\n        if n < 10 && n > -10 {\n            println!(", and is a small number, increase ten-fold");\n\n            // This expression returns an `i32`.\n            10 * n\n        } else {\n            println!(", and is a big number, halve the number");\n\n            // This expression must return an `i32` as well.\n            n / 2\n            // TODO ^ Try suppressing this expression with a semicolon.\n        };\n    //   ^ Don't forget to put a semicolon here! All `let` bindings need it.\n\n    println!("{} -> {}", n, big_n);\n}

\n\n\n\n

Rust provides a `loop` keyword to indicate an infinite loop.

\n\n\n\n

The `break` statement can be used to exit a loop at anytime, whereas the `continue` statement can be used to skip the rest of the iteration and start a new one.

\n\n\n\n

可以把loop视作提供的语法糖，就是一个只能break跳出的循环

\n\n\n\n

而且loop循环可以嵌套，并且要求进行annotation来决定跳出哪个：

\n\n\n\n

It's possible to `break` or `continue` outer loops when dealing with nested loops. In these cases, the loops must be annotated with some `'label`, and the label must be passed to the `break`/`continue` statement.

\n\n\n\n
    
    
    #![allow(unreachable_code, unused_labels)]\n\nfn main() {\n    'outer: loop {\n        println!("Entered the outer loop");\n\n        'inner: loop {\n            println!("Entered the inner loop");\n\n            // This would break only the inner loop\n            //break;\n\n            // This breaks the outer loop\n            break 'outer;\n        }\n\n        println!("This point will never be reached");\n    }\n\n    println!("Exited the outer loop");\n}

\n\n\n\n

假如把loop作为一个expr,他的返回值可以放在break后面

\n\n\n\n
    
    
    fn main() {\n    let mut counter = 0;\n\n    let result = loop {\n        counter += 1;\n\n        if counter == 10 {\n            break counter * 2;\n        }\n    };\n\n    assert_eq!(result, 20);\n}

\n\n\n\n

### while

\n\n\n\n
    
    
    fn main() {\n    // A counter variable\n    let mut n = 1;\n\n    // Loop while `n` is less than 101\n    while n < 101 {\n        if n % 15 == 0 {\n            println!("fizzbuzz");\n        } else if n % 3 == 0 {\n            println!("fizz");\n        } else if n % 5 == 0 {\n            println!("buzz");\n        } else {\n            println!("{}", n);\n        }\n\n        // Increment counter\n        n += 1;\n    }\n}

\n\n\n\n

### for……range

\n\n\n\n
    
    
    fn main() {\n    // `n` will take the values: 1, 2, ..., 100 in each iteration\n    for n in 1..101 {\n        if n % 15 == 0 {\n            println!("fizzbuzz");\n        } else if n % 3 == 0 {\n            println!("fizz");\n        } else if n % 5 == 0 {\n            println!("buzz");\n        } else {\n            println!("{}", n);\n        }\n    }\n}\n\nfn main() {\n    // `n` will take the values: 1, 2, ..., 100 in each iteration\n    for n in 1..=100 {\n        if n % 15 == 0 {\n            println!("fizzbuzz");\n        } else if n % 3 == 0 {\n            println!("fizz");\n        } else if n % 5 == 0 {\n            println!("buzz");\n        } else {\n            println!("{}", n);\n        }\n    }\n}

\n\n\n\n

以上两种是for的range结合用法，此外还有iter的标称代码，

\n\n\n\n

The `for in` construct is able to interact with an `Iterator` in several ways. As discussed in the section on the [Iterator](<https://doc.rust-lang.org/stable/rust-by-example/trait/iter.html>) trait, by default the `for` loop will apply the `into_iter` function to the collection. However, this is not the only means of converting collections into iterators.

\n\n\n\n

`into_iter`, `iter` and `iter_mut` all handle the conversion of a collection into an iterator in different ways, by providing different views on the data within.

\n\n\n\n

`iter` \- This **borrows** each element of the collection through each iteration. Thus leaving the collection untouched and available for reuse after the loop.

\n\n\n\n
    
    
    fn main() {\n    let names = vec!["Bob", "Frank", "Ferris"];\n\n    for name in names.iter() {\n        match name {\n            &"Ferris" => println!("There is a rustacean among us!"),\n            // TODO ^ Try deleting the & and matching just "Ferris"\n            _ => println!("Hello {}", name),\n        }\n    }\n    \n    println!("names: {:?}", names);\n}

\n\n\n\n

`into_iter` \- This consumes the collection so that on each iteration the exact data is provided. Once the collection has been consumed it is no longer available for reuse as it has been 'moved' within the loop.

\n\n\n\n
    
    
    fn main() {\n    let names = vec!["Bob", "Frank", "Ferris"];\n\n    for name in names.into_iter() {\n        match name {\n            "Ferris" => println!("There is a rustacean among us!"),\n            _ => println!("Hello {}", name),\n        }\n    }\n    \n    //println!("names: {:?}", names);\n    // FIXME ^ Comment out this line\n}

\n\n\n\n

\n