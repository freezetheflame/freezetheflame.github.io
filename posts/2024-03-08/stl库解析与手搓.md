---
title: STL库解析
date: 2024-03-08
tags: [C++]
---


## The Basic Knowledge and Overview

**The Standard Template Library**(STL) is a (language built in) library for C++. This means, that C++ Standard defines everything in STL and compiler writers have to implement them, so that we, lesser mortals, can simply include and use them. STL consists of 4 major parts:

  * **Containers** :  data structures to store objects of the same type, with basic functionality (insertion, removal, lookup)

  * **algorithms:** set of helpful and reliable algorithms

  * **iterators:** objects mostly used to apply make algorithms work on containers, also to iterate and manipulate the data in the containers

  * **functors:** objects, that behave like functions, and are used by algorithms

## Where to start?

Cloude 3 give me some advice on it.

When implementing a "tinySTL," the recommended order to start with is:

  1. **Iterators**

Iterators are the foundation for most containers and algorithms in the Standard Template Library (STL). They provide a uniform way to access and traverse elements in containers. Implementing iterators first will make it easier to design and implement containers and algorithms later.

Here's why iterators should be the first part to implement:

  * Iterators encapsulate the traversal and access mechanisms for containers, abstracting away the underlying data structure.

  * 迭代器封装容器的遍历和访问机制，抽象出底层数据结构。

  * Containers rely on iterators to provide access to their elements, so having iterators in place early on will simplify the implementation of containers.

  * 容器依赖于迭代器来提供对其元素的访问，因此早期使用迭代器将简化容器的实现。

  * Algorithms in the STL operate on ranges defined by iterators, so having iterators implemented first will allow you to test and validate your algorithms more easily.

  * Implementing iterators first will help you understand the different iterator categories (input, output, forward, bidirectional, and random-access) and their associated requirements and constraints.

  2. **Containers**

After implementing iterators, the next logical step is to implement the containers. Containers are the data structures that hold the elements and provide access to them through iterators.

Some reasons to implement containers after iterators:

  * Containers can be designed and implemented more easily when iterators are already in place, as they can rely on the iterator interface for element access and traversal.

  * Different containers have different iterator requirements (e.g., `vector` requires random-access iterators, while `list` requires bidirectional iterators), so having iterators implemented first will make it easier to meet these requirements.

  * Implementing containers will help you understand memory management, allocation strategies, and the trade-offs between different container types.

  3. **Algorithms**

Once you have implemented iterators and containers, you can move on to implementing the algorithms in the STL. Algorithms operate on ranges defined by iterators and often use containers as the source or destination for their operations.

Reasons to implement algorithms after iterators and containers:

  * Algorithms rely on iterators to access and traverse the elements they operate on, so having iterators and containers in place will make it easier to implement and test algorithms.

  * Implementing algorithms will deepen your understanding of various algorithmic techniques, such as sorting, searching, and numeric algorithms.

  * Algorithms often have specific requirements for the iterators they work with (e.g., some algorithms require random-access iterators), so having iterators and containers implemented first will ensure that these requirements are met.

  4. **Function Objects (Functors)**

Function objects, or functors, are often used in conjunction with algorithms and containers in the STL. They provide a way to encapsulate and pass function-like objects as arguments to algorithms or containers.

**5.Adapters:**

Adapters are components that modify the behavior of other components in the STL. For example, the reverse_iterator adapter can be used to reverse the order of elements in a container.

Reasons to implement functors after iterators, containers, and algorithms:

  * Functors are often used with algorithms and containers, so it makes sense to implement them after you have a working implementation of iterators, containers, and algorithms.

  * Implementing functors will help you understand function objects, lambda expressions, and their role in the STL, as well as their applications in generic programming.

  * Functors can be used to customize the behavior of algorithms and containers, so having a solid understanding of iterators, containers, and algorithms first will make it easier to appreciate the utility of functors.

  * 

By following this order (iterators, containers, algorithms, and then functors), you'll build a solid foundation for your "tinySTL" implementation and gain a deeper understanding of the core components and their relationships within the Standard Template Library.

before we dip into "how to make a tiny STL" , we first discuss how to **"USE"** stl , and when it comes to the usage , It's probably most suitable to explain "Containers" first!!!

## Containers（容器）

容器是用来存储数据的序列，它们提供了不同的存储方式和访问模式。

STL 中的容器可以分为三类：

1、序列容器：存储元素的序列，允许双向遍历。

  * std::vector：动态数组，支持快速随机访问。

  * std::deque：双端队列，支持快速插入和删除。

  * std::list：链表，支持快速插入和删除，但不支持随机访问。

2、关联容器：存储键值对，每个元素都有一个键（key）和一个值（value），并且通过键来组织元素。

  * std::set：集合，不允许重复元素。

  * std::multiset：多重集合，允许多个元素具有相同的键。

  * std::map：映射，每个键映射到一个值。

  * std::multimap：多重映射，允许多个键映射到相同的值。

3、无序容器（C++11 引入）：哈希表，支持快速的查找、插入和删除。

  * std::unordered_set：无序集合。

  * std::unordered_multiset：无序多重集合。

  * std::unordered_map：无序映射。

  * std::unordered_multimap：无序多重映射。

### Vector in C++ STL

**td::vector  **in C++ is the class template that contains the vector container and its member functions. It is defined inside the **< vector>** header file. The member functions of the std::vector class provide various functionalities to vector containers.

vector是STL中最常见的容器，它是一种顺序容器，支持随机访问。vector是一块连续分配的内存，从数据安排的角度来讲，和数组极其相似，不同的地方就是：数组是静态分配空间，一旦分配了空间的大小，就不可再改变了；而vector是动态分配空间，随着元素的不断插入，它会按照自身的一套机制不断扩充自身的容量。

        vector的扩充机制：按照容器现在容量的一倍进行增长。vector容器分配的是**一块连续的内存空间** ，每次容器的增长，并不是在原有连续的内存空间后再进行简单的叠加，而是**重新申请** 一块更大的**新内存** ，并把现有容器中的元素逐个复制过去，然后销毁旧的内存。这时原有指向旧内存空间的迭代器已经失效，所以当操作容器时，**迭代器要及时更新** 。（特别注意！！！！）

#### Syntax to Declare Vector in C++


    
    std::vector<dataType> vectorName;

#### vector的数据结构

        vector数据结构，采用的是连续的线性空间，属于线性存储。他采用3个迭代器_First、_Last、_End来指向分配来的线性空间的不同范围，下面是声明3个迭代器变量的源代码。


    
    template<class _Ty, class _A= allocator< _Ty> > 
class vector{ 
    ... 
    protected: 
    iterator _First, _Last, _End; 
};

_First指向使用空间的头部，_Last指向使用空间大小（size）的尾部，_End指向使用空间容量（capacity）的尾部。例如：


    
    int data[6]={3,5,7,9,2,4}; 
vector<int> vdata(data, data+6); 
vdata.push_back(6);

vector初始化时，申请的空间大小为6，存放下了data中的6个元素。当向vdata中插入第7个元素“6”时，vector利用自己的扩充机制重新申请空间

简单描述一下。当插入第7个元素“6”时，vector发现自己的空间不够了，于是申请新的大小为12的内存空间（自增一倍），并将前面已有数据复制到新空间的前部，然后插入第7个元素。此时_Last迭代器指向最后一个有效元素，而_End迭代器指向vector的最后有效空间位置。我们利用vector的成员函数size可以获得当前vector的大小，此时为7；利用capacity成员函数获取当前vector的容量，此时为12。

因此在扩容的时候，一定得注意迭代器的及时更新

[vector 简介 - xiaohuaguan - 博客园 (cnblogs.com)](<https://www.cnblogs.com/xiaohuaguan/p/10744300.html>)

#### vector对象的比较（非成员函数）

   针对vector对象的比较有六个比较运算符：operator==、operator!=、operator<、operator<=、operator>、operator>=。

   其中，对于operator==和operator!=，如果vector对象拥有相同的元素个数，并且对应位置的元素全部相等，则两个vector对象相等；否则不等。

   对于operator<、operator<=、operator>、operator>=，采用字典排序策略比较。

注：其实只需要实现operator==和operator!=就可以了，其它可以根据这两个实现。因为，operator!= (lhs, rhs) 就是 !(lhs == rhs)，operator<=(lhs, rhs) 就是 !(rhs < lhs)，operator>(lhs, rhs) 就是 (rhs < lhs)，operator>=（lhs, rhs) 就是 !(lhs, rhs)。

#### vector类的迭代器

   vector类的迭代器除了支持通用的前缀自增运算符外，还支持算术运算：it + n、it - n、it2 - it1。注意it2 - it1返回值为difference_type（signed类型）。

   注意，任何改变容器大小的操作都可能造成以前的迭代器失效。

vector的初始化：

(1) empty container constructor (default constructor)Constructs an [empty](<https://cplusplus.com/vector::empty>) container, with no elements.  
(2) fill constructorConstructs a container with _n_  elements. Each element is a copy of _val_  (if provided).  
(3) range constructorConstructs a container with as many elements as the range [first,last), with each element _emplace-constructed_  from its corresponding element in that range, in the same order.  
(4) copy constructor (and copying with allocator)Constructs a container with a copy of each of the elements in _x_ , in the same order.  
(5) move constructor (and moving with allocator)Constructs a container that acquires the elements of _x_.  
If _alloc_  is specified and is different from _x_ 's allocator, the elements are moved. Otherwise, no elements are constructed (their ownership is directly transferred)._x_  is left in an unspecified but valid state.  
(6) initializer list constructorConstructs a container with a copy of each of the elements in _il_ , in the same order.

使用示例


    
    #include<stdio.h>
#include<vector>
#include <iostream>
using namespace std;
void main()
{
 int i = 0, j = 0;
 vector< vector<int> > Array;
 vector< int > line;
 for( j = 0; j < 10; j++ )
 {
  Array.push_back( line );//要对每一个vector初始化，否则不能存入元素。
  for ( i = 0; i < 9; i++ )
  {
   Array[ j ].push_back( i );
  }
 }
 for( j = 0; j < 10; j++ )
 {
  for( i = 0; i < Array[ j ].size(); i++ )
  {
   cout << Array[ j ][ i ] << "  ";
  }
  cout<< endl;
 }
}

example in bootcamp


    
    /**
 * @file vectors.cpp
 * @author Abigale Kim (abigalek)
 * @brief Tutorial code for C++ Standard Library (STL) vectors.
 */
// The C++ STL contains a container library, which is a generic collection of
// data structure and algorithm implementations that allow users to manipulate
// data structures like stacks, queues, and hash tables easily. Each container
// has its own header and usage. In the C++ standard (up to C++ 23), there are
// currently 20 containers, which is far too many to cover here well. In this
// file, we will introduce the container std::vector. The std::vector container
// is essentially a generic dynamic array (or unbounded array). We won't be
// able to cover every function in this container, but we will try to cover the
// basics of using this container.
// There is documentation on all the other functions, and other containers on
// https://en.cppreference.com/w/cpp/container. You will definitely need this
// resource as you complete the assignments in this class, so you should check
// it out!
// Includes std::remove_if to remove elements from vectors.
#include <algorithm>
// Includes std::cout (printing) for demo purposes.
#include <iostream>
// Includes the vector container library header.
#include <vector>
// Basic point class. (Will use later)
class Point {
public:
  Point() : x_(0), y_(0) {
    std::cout << "Default constructor for the Point class is called.\
";
  }
  Point(int x, int y) : x_(x), y_(y) {
    std::cout << "Custom constructor for the Point class is called.\
";
  }
  inline int GetX() const { return x_; }
  inline int GetY() const { return y_; }
  inline void SetX(int x) { x_ = x; }
  inline void SetY(int y) { y_ = y; }
  void PrintPoint() const {
    std::cout << "Point value is (" << x_ << ", " << y_ << ")\
";
  }
private:
  int x_;
  int y_;
};
// A utility function to print the elements of an int vector. The code for this
// should be understandable and similar to the code iterating through elements
// of a vector in the main function.
void print_int_vector(const std::vector<int> &vec) {
  for (const int &elem : vec) {
    std::cout << elem << " ";
  }
  std::cout << "\
";
}
int main() {
  // We can declare a Point vector with the following syntax.
  std::vector<Point> point_vector;
  // It is also possible to initialize the vector via an initializer list.
  std::vector<int> int_vector = {0, 1, 2, 3, 4, 5, 6};
  // There are two functions for appending data to the back of the vector. They
  // are push_back and emplace_back. Generally, emplace_back is slightly faster,
  // since it forwards the constructor arguments to the object's constructor and
  // constructs the object in place, while push_back constructs the object, then
  // moves it to the memory in the vector. We can see this here where we add two
  // Point objects to our vector.
  std::cout << "Appending to the point_vector via push_back:\
";
  point_vector.push_back(Point(35, 36));
  std::cout << "Appending to the point_vector via emplace_back:\
";
  point_vector.emplace_back(37, 38);
  // Let's just add more items to the back of our point_vector.
  point_vector.emplace_back(39, 40);
  point_vector.emplace_back(41, 42);
  // There are many ways to iterate through a vector. For instance, we can
  // iterate through it's indices via the following for loop. Note that it is
  // good practice to use an unsigned int type for array or vector indexes.
  std::cout << "Printing the items in point_vector:\
";
  for (size_t i = 0; i < point_vector.size(); ++i) {
    point_vector[i].PrintPoint();
  }
  // We can also iterate through it via a for-each loop. Note that I use
  // references to iterate through it so that the items we iterate through are
  // the items in the original vector. If we iterate through references of the
  // vector elements, we can also modify the data in the vector.
  for (Point &item : point_vector) {
    item.SetY(445);
  }
  // Let's see if our changes went through. Note that I use the const reference
  // syntax to ensure that the data I'm accessing is read only.
  for (const Point &item : point_vector) {
    item.PrintPoint();
  }
  // Now, we show how to erase elements from a vector. First, we can erase
  // elements by their position via the erase function. For instance, if we want
  // to delete int_vector[2], we can call the following function with the
  // following arguments. The argument passed into this erase function has
  // the type std::vector<int>::iterator. An iterator for a C++ STL container
  // is an object that points to an element within the container. For instance,
  // int_vector.begin() is an iterator object that points to the first element
  // in the vector. The vector iterator also has a plus operator that takes
  // a vector iterator and an integer. The plus operator will increase the 
  // index of the element that the iterator is pointing to by the number passed
  // in. Therefore, int_vector.begin() + 2 is pointing to the third element in
  // the vector, or the element at int_vector[2].
  // If you are confused about iterators, it may be helpful to read the header of
  // iterator.cpp.
  int_vector.erase(int_vector.begin() + 2);
  std::cout << "Printing the elements of int_vector after erasing "
               "int_vector[2] (which is 2)\
";
  print_int_vector(int_vector);
  // We can also erase elements in a range via the erase function. If we want to
  // delete elements starting from index 1 to the end of the array, then we can
  // do so the following. Note that int_vector.end() is an iterator pointing to
  // the end of the vector. It does not point to the last valid index of the
  // vector. It points to the end of a vector and cannot be accessed for data.
  int_vector.erase(int_vector.begin() + 1, int_vector.end());
  std::cout << "Printing the elements of int_vector after erasing all elements "
               "from index 1 through the end\
";
  print_int_vector(int_vector);
  // We can also erase values via filtering, i.e. erasing values if they meet a
  // conditional. We can do so by importing another library, the algorithm
  // library, which gives us the std::remove_if function, which removes all
  // elements meeting a conditional from an iterator range. This does seem
  // awfully complicated, but the code can be summarized as follows.
  // std::remove_if takes in 3 arguments. Two of those arguments indicate the
  // range of elements that we should filter. These are given by
  // point_vector.begin() and point_vector.end(), which are iterators that point
  // to the beginning and the end of a vector respectively. Therefore, when we
  // pass these in, we are implying that we want the whole vector filtered.
  // The third argument is a conditional lambda type (see the std::function
  // library in C++, or at 
  // https://en.cppreference.com/w/cpp/utility/functional/function), that takes
  // in one argument, which is supposed to represent each element in the vector
  // that we are filtering. This function should return a boolean that is true
  // if the element is to be filtered out and false otherwise. std::remove_if
  // returns an iterator pointing to the first element in the container that
  // should be eliminated. Keep in mind that it swaps elements as needed,
  // partitioning the elements that need to be deleted after the iterator value
  // it returns. When erase is called, it deletes only the elements that
  // remove_if has partitioned away to be deleted, up to the end of the vector.
  // This outer erase takes a range argument, as we saw in the previous example.
  point_vector.erase(
      std::remove_if(point_vector.begin(), point_vector.end(),
                     [](const Point &point) { return point.GetX() == 37; }),
      point_vector.end());
  // After calling remove here, we should see that three elements remain in our
  // point vector. Only the one with value (37, 445) is deleted.
  std::cout << "Printing the point_vector after (37, 445) is erased:\
";
  for (const Point &item : point_vector) {
    item.PrintPoint();
  }
  // We discuss more stylistic and readable ways of iterating through C++ STL
  // containers in auto.cpp! Check it out if you are interested.
  return 0;
}

1.push_back   在数组的最后添加一个数据  
2.pop_back    去掉数组的最后一个数据   
3.at                得到编号位置的数据  
4.begin           得到数组头的指针  
5.end             得到数组的最后一个单元+1的指针  
6．front        得到数组头的引用  
7.back            得到数组的最后一个单元的引用  
8.max_size     得到vector最大可以是多大  
9.capacity       当前vector分配的大小  
10.size           当前使用数据的大小  
11.resize         改变当前使用数据的大小，如果它比当前使用的大，者填充默认值  
12.reserve      改变当前vecotr所分配空间的大小  
13.erase         删除指针指向的数据项  
14.clear          清空当前的vector  
15.rbegin        将vector反转后的开始指针返回(其实就是原来的end-1)  
16.rend          将vector反转构的结束指针返回(其实就是原来的begin-1)  
17.empty        判断vector是否为空  
18.swap         与另一个vector交换数据

### Map in C++ STL

在 C++ 中，`<map>` 是标准模板库（STL）的一部分，它提供了一种关联容器，用于存储键值对（key-value pairs）。

`map` 容器中的元素是按照键的顺序自动排序的，这使得它非常适合需要快速查找和有序数据的场景。

### 定义和特性

  * **键值对** ：`map` 存储的是键值对，其中每个键都是唯一的。

  * **排序** ：`map` 中的元素按照键的顺序自动排序，通常是升序。

  * **唯一性** ：每个键在 `map` 中只能出现一次。

  * **双向迭代器** ：`map` 提供了双向迭代器，可以向前和向后遍历元素。
