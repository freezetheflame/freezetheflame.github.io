---
title: rustling 分部分总结
date: 2024-10-22
tags: [RUST]
---


## Primitives

在rust中有以下基本类型，很神奇的是rust乐意声明出一个类型的宽度，以更方便进行维护

### [Scalar Types](<https://doc.rust-lang.org/rust-by-example/primitives.html#scalar-types>)

  * Signed integers: `i8`, `i16`, `i32`, `i64`, `i128` and `isize` (pointer size)

  * Unsigned integers: `u8`, `u16`, `u32`, `u64`, `u128` and `usize` (pointer size)

  * Floating point: `f32`, `f64`

  * `char` Unicode scalar values like `'a'`, `'α'` and `'∞'` (4 bytes each)

  * `bool` either `true` or `false`

  * The unit type `()`, whose only possible value is an empty tuple: `()`

Despite the value of a unit type being a tuple, it is not considered a compound type because it does not contain multiple values.

### [Compound Types](<https://doc.rust-lang.org/rust-by-example/primitives.html#compound-types>)

  * Arrays like `[1, 2, 3]`

  * Tuples like `(1, true)`

Variables can always be _type annotated_. Numbers may additionally be annotated via a _suffix_  or _by default_. Integers default to `i32` and floats to `f64`. Note that Rust can also infer types from context.

简单来讲就是rust既可以进行类型推断，也可以通过后缀进行注释，整数默认i32，浮点默认f64

## [Custom Types](<https://doc.rust-lang.org/stable/rust-by-example/custom_types.html#custom-types>)

Rust custom data types are formed mainly through the two keywords:

  * `struct`: define a structure

  * `enum`: define an enumeration

rust并非java和c++意义上的OOP语言，因此所有的封装其实也是一种custom types,基本都围绕着以上两种类型进行，并且辅助以methods，traits等特性实现这样一个内容，并且rust的动态派发特性使得rust可以在运行时选择合适的实现

让我们具体来看一下在rust中的struct以及enum的特点：

### Struct

There are three types of structures ("structs") that can be created using the `struct` keyword:

  * Tuple structs, which are, basically, named tuples.

  * The classic [C structs](<https://en.wikipedia.org/wiki/Struct_\(C_programming_language\)>)

  * Unit structs, which are field-less, are useful for generics.


    
    struct Rectangle {
    // A rectangle can be specified by where the top left and bottom right
    // corners are in space.
    top_left: Point,
    bottom_right: Point,
}

这样定义之后，在使用时候，我们可以建立类似于下文这样的struct


    
    let another_point: Point = Point { x: 5.2, y: 0.2 };

并且为了方便初始化并且使用update语法更新部分，可以这样去定义struct


    
    fn create_order_template() -> Order {
    Order {
        name: String::from("Bob"),
        year: 2019,
        made_by_phone: false,
        made_by_mobile: false,
        made_by_email: true,
        item_number: 123,
        count: 0,
    }
}
let order_template = create_order_template();
        // TODO: Create your own order using the update syntax and template above!
        let your_order = Order{
            count: 1,
            item_number: 1,
            name: "Hacker in Rust".to_string(),
            ..order_template
        };

最重要的特征之一，我们可以给这样一般的c structs添加实例方法，如下：


    
    struct Package {
    sender_country: String,
    recipient_country: String,
    weight_in_grams: i32,
}
impl Package {
    fn new(sender_country: String, recipient_country: String, weight_in_grams: i32) -> Package {
        if weight_in_grams <= 0 {
            panic!("Can not ship a weightless package.")
        } else {
            Package {
                sender_country,
                recipient_country,
                weight_in_grams,
            }
        }
    }
    fn is_international(&self) -> bool {
        if self.sender_country != self.recipient_country {
            true
        } else {
            false
        }
    }
    fn get_fees(&self, cents_per_gram: i32) -> i32 {
        self.weight_in_grams * cents_per_gram
    }
}

### [Enums](<https://doc.rust-lang.org/stable/rust-by-example/custom_types/enum.html#enums>)

The `enum` keyword allows the creation of a type which may be one of a few different variants. Any variant which is valid as a `struct` is also valid in an `enum`.


    
    enum Message {
    Quit,
    Echo,
    Move,
    ChangeColor
}

这是一个最简单的enum类型，也是类似于其他语言的enum设计类型，但是实际上rust 的enum类型支持更加丰富的扩展，在enum中可以存储其他类型的数据：  


    
    enum Message {
    Move{x: i32, y: i32},
    Echo(String),
    ChangeColor(i32, i32, i32),
    Quit
}

并且和rust一样支持实例化的方法


    
    impl Message {
    fn call(&self) {
        println!("{:?}", self);
    }
}

并且结合match可以做到简单的“多态”


    
    enum Message {
    // TODO: implement the message variant types based on their usage below
    Quit,
    Echo(String),
    Move(Point),
    ChangeColor(u8, u8, u8)
}
struct Point {
    x: u8,
    y: u8,
}
struct State {
    color: (u8, u8, u8),
    position: Point,
    quit: bool,
    message: String
}
impl State {
    fn change_color(&mut self, color: (u8, u8, u8)) {
        self.color = color;
    }
    fn quit(&mut self) {
        self.quit = true;
    }
    fn echo(&mut self, s: String) { self.message = s }
    fn move_position(&mut self, p: Point) {
        self.position = p;
    }
    fn process(&mut self, message: Message) {
        // TODO: create a match expression to process the different message
        // variants
        // Remember: When passing a tuple as a function argument, you'll need
        // extra parentheses: fn function((t, u, p, l, e))
        match message {
            Message::Quit => self.quit(),
            Message::Echo(s) => self.echo(s),
            Message::Move(p) => self.move_position(p),
            Message::ChangeColor(r, g, b) => self.change_color((r, g, b))
        }
    }
}

## [Variable Bindings](<https://doc.rust-lang.org/rust-by-example/variable_bindings.html#variable-bindings>)


    
        let an_integer = 1u32;
    let a_boolean = true;
    let unit = ();
    // copy `an_integer` into `copied_integer`
    let copied_integer = an_integer;
    println!("An integer: {:?}", copied_integer);
    println!("A boolean: {:?}", a_boolean);
    println!("Meet the unit value: {:?}", unit);

### [Mutability](<https://doc.rust-lang.org/stable/rust-by-example/variable_bindings/mut.html#mutability>)

Variable bindings are immutable by default, but this can be overridden using the `mut` modifier.

在默认情况下这里的变量绑定之后都是不能更改的

Variable bindings have a scope, and are constrained to live in a  _block_. A block is a collection of statements enclosed by braces `{}` 即有关域的内容，允许shadowing的行为（即小定义域内的变量>大定义域）

It's possible to declare variable bindings first, and initialize them later. However, this form is seldom used, as it may lead to the use of uninitialized variables.（只声明不初始化不是好习惯）

## [Types](<https://doc.rust-lang.org/stable/rust-by-example/types.html#types>)

Rust provides several mechanisms to change or define the type of primitive and user defined types. The following sections cover:

  * [Casting](<https://doc.rust-lang.org/stable/rust-by-example/types/cast.html>) between primitive types

  * Specifying the desired type of [literals](<https://doc.rust-lang.org/stable/rust-by-example/types/literals.html>)

  * Using [type inference](<https://doc.rust-lang.org/stable/rust-by-example/types/inference.html>)

  * [Aliasing](<https://doc.rust-lang.org/stable/rust-by-example/types/alias.html>) types

Rust provides no implicit type conversion (coercion) between primitive types. But, explicit type conversion (casting) can be performed using the `as` keyword.

虽然不允许隐式转换，但是使用as作为关键字是可以进行显式转换的。


    
    // Suppress all warnings from casts which overflow.
#![allow(overflowing_literals)]
fn main() {
    let decimal = 65.4321_f32;
    // Error! No implicit conversion
    let integer: u8 = decimal;
    // FIXME ^ Comment out this line
    // Explicit conversion
    let integer = decimal as u8;
    let character = integer as char;
    // Error! There are limitations in conversion rules.
    // A float cannot be directly converted to a char.
    let character = decimal as char;
    // FIXME ^ Comment out this line
    println!("Casting: {} -> {} -> {}", decimal, integer, character);
    // when casting any value to an unsigned type, T,
    // T::MAX + 1 is added or subtracted until the value
    // fits into the new type
    // 1000 already fits in a u16
    println!("1000 as a u16 is: {}", 1000 as u16);
    // 1000 - 256 - 256 - 256 = 232
    // Under the hood, the first 8 least significant bits (LSB) are kept,
    // while the rest towards the most significant bit (MSB) get truncated.
    println!("1000 as a u8 is : {}", 1000 as u8);
    // -1 + 256 = 255
    println!("  -1 as a u8 is : {}", (-1i8) as u8);
    // For positive numbers, this is the same as the modulus
    println!("1000 mod 256 is : {}", 1000 % 256);
    // When casting to a signed type, the (bitwise) result is the same as
    // first casting to the corresponding unsigned type. If the most significant
    // bit of that value is 1, then the value is negative.
    // Unless it already fits, of course.
    println!(" 128 as a i16 is: {}", 128 as i16);
    // In boundary case 128 value in 8-bit two's complement representation is -128
    println!(" 128 as a i8 is : {}", 128 as i8);
    // repeating the example above
    // 1000 as u8 -> 232
    println!("1000 as a u8 is : {}", 1000 as u8);
    // and the value of 232 in 8-bit two's complement representation is -24
    println!(" 232 as a i8 is : {}", 232 as i8);
    // Since Rust 1.45, the `as` keyword performs a *saturating cast*
    // when casting from float to int. If the floating point value exceeds
    // the upper bound or is less than the lower bound, the returned value
    // will be equal to the bound crossed.
    // 300.0 as u8 is 255
    println!(" 300.0 as u8 is : {}", 300.0_f32 as u8);
    // -100.0 as u8 is 0
    println!("-100.0 as u8 is : {}", -100.0_f32 as u8);
    // nan as u8 is 0
    println!("   nan as u8 is : {}", f32::NAN as u8);
    // This behavior incurs a small runtime cost and can be avoided
    // with unsafe methods, however the results might overflow and
    // return **unsound values**. Use these methods wisely:
    unsafe {
        // 300.0 as u8 is 44
        println!(" 300.0 as u8 is : {}", 300.0_f32.to_int_unchecked::<u8>());
        // -100.0 as u8 is 156
        println!("-100.0 as u8 is : {}", (-100.0_f32).to_int_unchecked::<u8>());
        // nan as u8 is 0
        println!("   nan as u8 is : {}", f32::NAN.to_int_unchecked::<u8>());
    }
}

The type inference engine is pretty smart. It does more than looking at the type of the value expression during an initialization. It also looks at how the variable is used afterwards to infer its type. Here's an advanced example of type inference:rust实际上的类型推断有如下的实现


    
    fn main() {
    // Because of the annotation, the compiler knows that `elem` has type u8.
    let elem = 5u8;
    // Create an empty vector (a growable array).
    let mut vec = Vec::new();
    // At this point the compiler doesn't know the exact type of `vec`, it
    // just knows that it's a vector of something (`Vec<_>`).
    // Insert `elem` in the vector.
    vec.push(elem);
    // Aha! Now the compiler knows that `vec` is a vector of `u8`s (`Vec<u8>`)
    // TODO ^ Try commenting out the `vec.push(elem)` line

    println!("{:?}", vec);
}

The `type` statement can be used to give a new name to an existing type. Types must have `**UpperCamelCase**` names, or the compiler will raise a warning

可以使用type NewType = existingtype这样的语法来给类型赋予新名字（alias）

### From

## [`From`](<https://doc.rust-lang.org/stable/rust-by-example/conversion/from_into.html#from>)

The [`From`](<https://doc.rust-lang.org/std/convert/trait.From.html>) trait allows for a type to define how to create itself from another type, hence providing a very simple mechanism for converting between several types. There are numerous implementations of this trait within the standard library for conversion of primitive and common types.

For example we can easily convert a `str` into a `String`


    
    let my_str = "hello";
let my_string = String::from(my_str);

对于没有默认实现的，我们可以通过如下方式声明这样的from转换


    
    use std::convert::From;
#[derive(Debug)]
struct Number {
    value: i32,
}
impl From<i32> for Number {
    fn from(item: i32) -> Self {
        Number { value: item }
    }
}
fn main() {
    let num = Number::from(30);
    println!("My number is {:?}", num);
}

## [`Into`](<https://doc.rust-lang.org/stable/rust-by-example/conversion/from_into.html#into>)

The [`Into`](<https://doc.rust-lang.org/std/convert/trait.Into.html>) trait is simply the reciprocal of the `From` trait. It defines how to convert a type into another type.

Calling `into()` typically requires us to specify the result type as the compiler is unable to determine this most of the time.

`From` and `Into` are designed to be complementary


    
    use std::convert::Into;
#[derive(Debug)]
struct Number {
    value: i32,
}
impl Into<Number> for i32 {
    fn into(self) -> Number {
        Number { value: self }
    }
}
fn main() {
    let int = 5;
    // Try removing the type annotation
    let num: Number = int.into();//we should declare the annotation
    println!("My number is {:?}", num);
}

### [Converting to String](<https://doc.rust-lang.org/stable/rust-by-example/conversion/string.html#converting-to-string>)

To convert any type to a `String` is as simple as implementing the [`ToString`](<https://doc.rust-lang.org/std/string/trait.ToString.html>) trait for the type. Rather than doing so directly, you should**implement the[`fmt::Display`](<https://doc.rust-lang.org/std/fmt/trait.Display.html>) trait** which automagically provides [`ToString`](<https://doc.rust-lang.org/std/string/trait.ToString.html>) and also allows printing the type as discussed in the section on [`print!`](<https://doc.rust-lang.org/stable/rust-by-example/hello/print.html>).


    
    use std::fmt;
struct Circle {
    radius: i32
}
impl fmt::Display for Circle {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "Circle of radius {}", self.radius)
    }
}
fn main() {
    let circle = Circle { radius: 6 };
    println!("{}", circle.to_string());
}

### Expressions

关于rust的表达式，其实只要下面的例子就能略知一二


    
    fn main() {
    let x = 5u32;
    let y = {
        let x_squared = x * x;
        let x_cube = x_squared * x;
        // This expression will be assigned to `y`
        x_cube + x_squared + x
    };
    let z = {
        // The semicolon suppresses this expression and `()` is assigned to `z`
        2 * x;
    };
    println!("x is {:?}", x);
    println!("y is {:?}", y);
    println!("z is {:?}", z);
}

## Flow of Control

### if-else

Branching with `if`-`else` is similar to other languages. Unlike many of them, the boolean condition doesn't need to be surrounded by parentheses, and each condition is followed by a block. `if`-`else` conditionals are expressions, and, all branches must return the same type.

在rust中万物皆expr,所以对于一个ifelse语句来讲也可以这样


    
    fn main() {
    let n = 5;
    if n < 0 {
        print!("{} is negative", n);
    } else if n > 0 {
        print!("{} is positive", n);
    } else {
        print!("{} is zero", n);
    }
    let big_n =
        if n < 10 && n > -10 {
            println!(", and is a small number, increase ten-fold");
            // This expression returns an `i32`.
            10 * n
        } else {
            println!(", and is a big number, halve the number");
            // This expression must return an `i32` as well.
            n / 2
            // TODO ^ Try suppressing this expression with a semicolon.
        };
    //   ^ Don't forget to put a semicolon here! All `let` bindings need it.
    println!("{} -> {}", n, big_n);
}

Rust provides a `loop` keyword to indicate an infinite loop.

The `break` statement can be used to exit a loop at anytime, whereas the `continue` statement can be used to skip the rest of the iteration and start a new one.

可以把loop视作提供的语法糖，就是一个只能break跳出的循环

而且loop循环可以嵌套，并且要求进行annotation来决定跳出哪个：

It's possible to `break` or `continue` outer loops when dealing with nested loops. In these cases, the loops must be annotated with some `'label`, and the label must be passed to the `break`/`continue` statement.


    
    #![allow(unreachable_code, unused_labels)]
fn main() {
    'outer: loop {
        println!("Entered the outer loop");
        'inner: loop {
            println!("Entered the inner loop");
            // This would break only the inner loop
            //break;
            // This breaks the outer loop
            break 'outer;
        }
        println!("This point will never be reached");
    }
    println!("Exited the outer loop");
}

假如把loop作为一个expr,他的返回值可以放在break后面


    
    fn main() {
    let mut counter = 0;
    let result = loop {
        counter += 1;
        if counter == 10 {
            break counter * 2;
        }
    };
    assert_eq!(result, 20);
}

### while


    
    fn main() {
    // A counter variable
    let mut n = 1;
    // Loop while `n` is less than 101
    while n < 101 {
        if n % 15 == 0 {
            println!("fizzbuzz");
        } else if n % 3 == 0 {
            println!("fizz");
        } else if n % 5 == 0 {
            println!("buzz");
        } else {
            println!("{}", n);
        }
        // Increment counter
        n += 1;
    }
}

### for……range


    
    fn main() {
    // `n` will take the values: 1, 2, ..., 100 in each iteration
    for n in 1..101 {
        if n % 15 == 0 {
            println!("fizzbuzz");
        } else if n % 3 == 0 {
            println!("fizz");
        } else if n % 5 == 0 {
            println!("buzz");
        } else {
            println!("{}", n);
        }
    }
}
fn main() {
    // `n` will take the values: 1, 2, ..., 100 in each iteration
    for n in 1..=100 {
        if n % 15 == 0 {
            println!("fizzbuzz");
        } else if n % 3 == 0 {
            println!("fizz");
        } else if n % 5 == 0 {
            println!("buzz");
        } else {
            println!("{}", n);
        }
    }
}

以上两种是for的range结合用法，此外还有iter的标称代码，

The `for in` construct is able to interact with an `Iterator` in several ways. As discussed in the section on the [Iterator](<https://doc.rust-lang.org/stable/rust-by-example/trait/iter.html>) trait, by default the `for` loop will apply the `into_iter` function to the collection. However, this is not the only means of converting collections into iterators.

`into_iter`, `iter` and `iter_mut` all handle the conversion of a collection into an iterator in different ways, by providing different views on the data within.

`iter` \- This **borrows** each element of the collection through each iteration. Thus leaving the collection untouched and available for reuse after the loop.


    
    fn main() {
    let names = vec!["Bob", "Frank", "Ferris"];
    for name in names.iter() {
        match name {
            &"Ferris" => println!("There is a rustacean among us!"),
            // TODO ^ Try deleting the & and matching just "Ferris"
            _ => println!("Hello {}", name),
        }
    }

    println!("names: {:?}", names);
}

`into_iter` \- This consumes the collection so that on each iteration the exact data is provided. Once the collection has been consumed it is no longer available for reuse as it has been 'moved' within the loop.


    
    fn main() {
    let names = vec!["Bob", "Frank", "Ferris"];
    for name in names.into_iter() {
        match name {
            "Ferris" => println!("There is a rustacean among us!"),
            _ => println!("Hello {}", name),
        }
    }

    //println!("names: {:?}", names);
    // FIXME ^ Comment out this line
}
