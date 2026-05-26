---
title: C++ new features
date: 2024-08-29
tags: [C++]
---


## decltype (since c++11)

[C++11特性：decltype关键字 - melonstreet - 博客园 (cnblogs.com)](<https://www.cnblogs.com/QG-whz/p/4952980.html>)

我们之前使用的typeid运算符来查询一个变量的类型，这种类型查询在运行时进行。RTTI机制为每一个类型产生一个type_info类型的数据，而typeid查询返回的变量相应type_info数据，通过name成员函数返回类型的名称。同时在C++11中typeid还提供了hash_code这个成员函数，用于返回类型的唯一哈希值。RTTI会导致运行时效率降低，且在泛型编程中，我们更需要的是编译时就要确定类型，RTTI并无法满足这样的要求。编译时类型推导的出现正是为了泛型编程，在非泛型编程中，我们的类型都是确定的，根本不需要再进行推导。

而编译时类型推导，除了我们说过的auto关键字，还有本文的decltype。

decltype与auto关键字一样，用于进行编译时类型推导，不过它与auto还是有一些区别的。decltype的类型推导并不是像auto一样是从变量声明的初始化表达式获得变量的类型，而是总是**以一个普通表达式作为参数** ，返回该表达式的类型,而且decltype并不会对表达式进行求值。


    
    auto varName=value;
decltype(exp) varName=value;

  * uto根据=右边的初始值推导出变量的类型，decltype根据exp表达式推导出变量的类型，跟=右边的value没有关系

  * auto要求变量必须初始化，这是因为auto根据变量的初始值来推导变量类型的，如果不初始化，变量的类型也就无法推导

  * 而decltype不要求，因此可以写成如下形式


    
    decltype(exp) varName;

原则上将，exp只是一个普通的表达式，它可以是任意复杂的形式，但必须保证exp的结果是有类型的，不能是void；如exp为一个返回值为void的函数时，exp的结果也是void类型，此时会导致编译错误

decltype的推导规则可以简单概述如下：

  * 如果exp是一个不被括号()包围的表达式，或者是一个类成员访问表达式，或者是一个单独的变量，decltype(exp)的类型和exp一致

  * 如果exp是函数调用，则decltype(exp)的类型就和函数返回值的类型一致

    * 如果exp是一个左值，或被括号()包围，decltype(exp)的类型就是exp的引用，假设exp的类型为T，则decltype(exp)的类型为T&

## decltype用法

### 推导出表达式类型


    
        int i = 4;
    decltype(i) a; //推导结果为int。a的类型为int。

### 与using/typedef合用，用于定义类型。


    
        using size_t = decltype(sizeof(0));//sizeof(a)的返回值为size_t类型
    using ptrdiff_t = decltype((int*)0 - (int*)0);
    using nullptr_t = decltype(nullptr);


    
        vector<int >vec;
    typedef decltype(vec.begin()) vectype;
    for (vectype i = vec.begin; i != vec.end(); i++)
    {
        //...
    }

这样和auto一样，也提高了代码的可读性。

### 重用匿名类型

在C++中，我们有时候会遇上一些匿名类型，如:


    
    struct 
{
    int d ;
    doubel b;
}anon_s;

而借助decltype，我们可以重新使用这个匿名的结构体：


    
    decltype(anon_s) as ;//定义了一个上面匿名的结构体

### 泛型编程中结合auto，用于追踪函数的返回值类型

这也是decltype最大的用途了。


    
    template <typename _Tx, typename _Ty>
auto multiply(_Tx x, _Ty y)->decltype(_Tx*_Ty)
{
    return x*y;
}

## copy copy_if 用法(from <algorithm> <numeric>)

### 1.功能[#](<https://www.cnblogs.com/pandamohist/p/13854881.html#3041064392>)

复制 [first, last) 所定义的范围中的元素到始于 d_first 的另一范围.  
区别: copy_if 带条件拷贝,而非全拷贝


    
    template< class InputIt, class OutputIt >
OutputIt copy( InputIt first, InputIt last,OutputIt d_first );
template< class InputIt, class OutputIt, class UnaryPred >
OutputIt copy_if( InputIt first, InputIt last, OutputIt d_first, UnaryPred pred );

示例使用


    
    // 1. 构建一个原始数组
std::vector<int> src_vector(5);
// iota(起始，结束，从哪一个开始);
std::iota(src_vector.begin(), src_vector.end(), 10);
// 2. 将原始数组拷贝到目标数组
std::vector<int> dst_vector;
// 3. 执行拷贝
std::copy(src_vector.begin(), src_vector.end(), std::back_inserter(dst_vector));

// 4.遍历输出目标数组和原始数组
std::cout << "原始数组：\
";
std::for_each(src_vector.begin(), src_vector.end(), [](const int &item) {std::cout << "item = " << item << std::endl; });
std::cout << "目标数组：\
";
std::for_each(dst_vector.begin(), dst_vector.end(), [](const int &item) {std::cout << "item = " << item << std::endl; });


    
    // 1. 构建一个原始数组
std::vector<int> src_vector(5);
// iota(起始，结束，从哪一个开始);
std::iota(src_vector.begin(), src_vector.end(), 10);
// 2. 将原始数组拷贝到目标数组
std::vector<int> dst_vector(src_vector.size());
// 3. 将 src 拷贝到 dst，当时只拷贝大于13的元素。
auto it = std::copy_if(src_vector.begin(), src_vector.end(), dst_vector.begin(), [](const int item) {return item > 13; });
// 调整拷贝后的大小，为什么？ 因为初始化时，指定了其大小
dst_vector.resize(std::distance(dst_vector.begin(), it));

// 4.遍历输出目标数组和原始数组
std::cout << "原始数组：\
";
std::for_each(src_vector.begin(), src_vector.end(), [](const int &item) {std::cout << "item = " << item << std::endl; });
std::cout << "目标数组：\
";
std::for_each(dst_vector.begin(), dst_vector.end(), [](const int &item) {std::cout << "item = " << item << std::endl; });

## remove_if(since c++17)

Defined in header `[<algorithm>](<https://en.cppreference.com/w/cpp/header/algorithm>)`


    
    template< class ExecutionPolicy, class ForwardIt, class UnaryPred >
ForwardIt remove_if( ExecutionPolicy&& policy,
                     ForwardIt first, ForwardIt last, UnaryPred p );

Removes all elements satisfying specific criteria from the range `[`first`,`last`)` and returns a past-the-end iterator for the new end of the range.

对于没有if的版本，即std::remove（until c++26）


    
    template< class ForwardIt, class T >
ForwardIt remove( ForwardIt first, ForwardIt last, const T& value );

1) Removes all elements that are equal to value (using operator==).（remove）

3) Removes all elements for which predicate p returns true.(remove_if)

所以remove_if相比于remove即可以用其他判断的indicator来做是否需要remove的判断，最后返回的是新container的end，即把所有需要删除的元素都移到了某位，可以用erase等container方法从remove_if返回的迭代器到原来的end的部分全部删除，实现删去。

除此之外，list这个类存在一个内部的remove_if方法，可以删除）
