---
title: python中的一些注解解释
date: 2025-08-26
tags: [python, 基础语法]
---


## @wraps

**functools** is a standard Python module for higher-order functions (functions that act on or return other functions). wraps() is a decorator that is applied to the wrapper function of a decorator. **It updates the wrapper function to look like wrapped function by copying attributes such as __name__, __doc__**(the docstring), etc.


    
    Syntax: @functools.wraps(wrapped, assigned = WRAPPER_ASSIGNMENTS, updated = WRAPPER_UPDATES)
Parameters: 
  wrapped: The function name that is to be decorated by wrapper function. 
  assigned : Tuple to specify which attributes of the original function are assigned     directly to the matching attributes on the wrapper function. By default set to WRAPPER_ASSIGNMENTS (which assigns to the wrapper function’s __module__, __name__, __qualname__, __annotations__ and __doc__, the documentation string) 
  updated : Tuple to specify which attributes of the wrapper function are updated with the corresponding attributes from the original function. By default set to WRAPPER_UPDATES (which updates the wrapper function’s __dict__, i.e. the instance dictionary). 

在缺失@wraps时，如下代码的输出是这样的


    
    def a_decorator(func):
    def wrapper(*args, **kwargs):
        """A wrapper function"""
        # Extend some capabilities of func
        func()
    return wrapper
@a_decorator
def first_function():
    """This is docstring for first function"""
    print("first function")
@a_decorator
def second_function(a):
    """This is docstring for second function"""
    print("second function")
print(first_function.__name__)
print(first_function.__doc__)
print(second_function.__name__)
print(second_function.__doc__)


    
    **wrapper  
     A wrapper function  
    wrapper  
    A wrapper function**

虽然上面的代码在逻辑上可以正常工作，但如果你正在编写一个 API 或库，并且有人想知道你的函数做什么，它的名称或只是简单地键入 help（yourFunction），请考虑这一点，**它将始终显示包装函数的名称和文档字符串** 。如果您对不同的函数使用相同的包装函数，这会更加混乱，因为它将为每个函数显示相同的详细信息。

理想情况下，它应该显示包装函数的名称和文档字符串，而不是包装函数。手动解决方案是在返回之前在包装函数中分配__name____doc__属性。


    
    def a_decorator(func):
    def wrapper(*args, **kwargs):
        """A wrapper function"""
        # Extend some capabilities of func
        func()
    wrapper.__name__ = func.__name__
    wrapper.__doc__ = func.__doc__
    return wrapper
@a_decorator
def first_function():
    """This is docstring for first function"""
    print("first function")
@a_decorator
def second_function(a):
    """This is docstring for second function"""
    print("second function")
print(first_function.__name__)
print(first_function.__doc__)
print(second_function.__name__)
print(second_function.__doc__)

这样子拷贝过去可以解决一定问题，但是如果我们再次键入 help（yourFunction） 会怎样


    
    First Function
Help on function first_function in module __main__:
first_function(*args, **kwargs)
    This is docstring for first function

Second Function
Help on function second_function in module __main__:
second_function(*args, **kwargs)
    This is docstring for second function

如您所见，它仍然存在一个问题，即函数的签名，它显示了包装函数使用的签名（这里是通用签名）每个函数的签名。此外，如果您要实现许多装饰器，那么您必须为每个装饰器编写这些行。  
因此，为了节省时间并提高可读性，我们可以使用 **functools.wraps（） 作为包装函数的装饰器** 。


    
    from functools import wraps
def a_decorator(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        """A wrapper function"""
        # Extend some capabilities of func
        func()
    return wrapper
@a_decorator
def first_function():
    """This is docstring for first function"""
    print("first function")
@a_decorator
def second_function(a):
    """This is docstring for second function"""
    print("second function")
print(first_function.__name__)
print(first_function.__doc__)
print(second_function.__name__)
print(second_function.__doc__)

**Output:****输出：**


    
    first_function  
    This is docstring for first function  
    second_function  
    This is docstring for second function
