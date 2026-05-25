---
title: python中的一些注解解释
date: 2025-08-26
tags: [python, 基础语法]
---

\n

## @wraps

\n\n\n\n

**functools** is a standard Python module for higher-order functions (functions that act on or return other functions). wraps() is a decorator that is applied to the wrapper function of a decorator. **It updates the wrapper function to look like wrapped function by copying attributes such as __name__, __doc__**(the docstring), etc.

\n\n\n\n
    
    
    Syntax: @functools.wraps(wrapped, assigned = WRAPPER_ASSIGNMENTS, updated = WRAPPER_UPDATES)\nParameters: \n  wrapped: The function name that is to be decorated by wrapper function. \n  assigned : Tuple to specify which attributes of the original function are assigned     directly to the matching attributes on the wrapper function. By default set to WRAPPER_ASSIGNMENTS (which assigns to the wrapper function’s __module__, __name__, __qualname__, __annotations__ and __doc__, the documentation string) \n  updated : Tuple to specify which attributes of the wrapper function are updated with the corresponding attributes from the original function. By default set to WRAPPER_UPDATES (which updates the wrapper function’s __dict__, i.e. the instance dictionary). 

\n\n\n\n

在缺失@wraps时，如下代码的输出是这样的

\n\n\n\n
    
    
    def a_decorator(func):\n    def wrapper(*args, **kwargs):\n        """A wrapper function"""\n        # Extend some capabilities of func\n        func()\n    return wrapper\n\n@a_decorator\ndef first_function():\n    """This is docstring for first function"""\n    print("first function")\n\n@a_decorator\ndef second_function(a):\n    """This is docstring for second function"""\n    print("second function")\n\nprint(first_function.__name__)\nprint(first_function.__doc__)\nprint(second_function.__name__)\nprint(second_function.__doc__)

\n\n\n\n
    
    
    **wrapper  
     A wrapper function  
    wrapper  
    A wrapper function**

\n\n\n\n

虽然上面的代码在逻辑上可以正常工作，但如果你正在编写一个 API 或库，并且有人想知道你的函数做什么，它的名称或只是简单地键入 help（yourFunction），请考虑这一点，**它将始终显示包装函数的名称和文档字符串** 。如果您对不同的函数使用相同的包装函数，这会更加混乱，因为它将为每个函数显示相同的详细信息。

\n\n\n\n

理想情况下，它应该显示包装函数的名称和文档字符串，而不是包装函数。手动解决方案是在返回之前在包装函数中分配__name____doc__属性。

\n\n\n\n
    
    
    def a_decorator(func):\n    def wrapper(*args, **kwargs):\n        """A wrapper function"""\n        # Extend some capabilities of func\n        func()\n    wrapper.__name__ = func.__name__\n    wrapper.__doc__ = func.__doc__\n    return wrapper\n\n@a_decorator\ndef first_function():\n    """This is docstring for first function"""\n    print("first function")\n\n@a_decorator\ndef second_function(a):\n    """This is docstring for second function"""\n    print("second function")\n\nprint(first_function.__name__)\nprint(first_function.__doc__)\nprint(second_function.__name__)\nprint(second_function.__doc__)

\n\n\n\n

这样子拷贝过去可以解决一定问题，但是如果我们再次键入 help（yourFunction） 会怎样

\n\n\n\n
    
    
    First Function\nHelp on function first_function in module __main__:\n\nfirst_function(*args, **kwargs)\n    This is docstring for first function\n\n\nSecond Function\nHelp on function second_function in module __main__:\n\nsecond_function(*args, **kwargs)\n    This is docstring for second function

\n\n\n\n

如您所见，它仍然存在一个问题，即函数的签名，它显示了包装函数使用的签名（这里是通用签名）每个函数的签名。此外，如果您要实现许多装饰器，那么您必须为每个装饰器编写这些行。  
因此，为了节省时间并提高可读性，我们可以使用 **functools.wraps（） 作为包装函数的装饰器** 。

\n\n\n\n
    
    
    from functools import wraps\n\ndef a_decorator(func):\n    @wraps(func)\n    def wrapper(*args, **kwargs):\n        """A wrapper function"""\n\n        # Extend some capabilities of func\n        func()\n    return wrapper\n\n@a_decorator\ndef first_function():\n    """This is docstring for first function"""\n    print("first function")\n\n@a_decorator\ndef second_function(a):\n    """This is docstring for second function"""\n    print("second function")\n\nprint(first_function.__name__)\nprint(first_function.__doc__)\nprint(second_function.__name__)\nprint(second_function.__doc__)

\n\n\n\n

**Output:****输出：**

\n\n\n\n
    
    
    first_function  
    This is docstring for first function  
    second_function  
    This is docstring for second function

\n\n\n\n

\n