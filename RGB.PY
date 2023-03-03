def rgb2html(r, g, b):
    """将RGB颜色转换为HTML颜色"""
    r_hex = hex(r)[2:].zfill(2)
    g_hex = hex(g)[2:].zfill(2)
    b_hex = hex(b)[2:].zfill(2)
    return f"#{r_hex}{g_hex}{b_hex}"

a=int(input())
b=int(input())
c=int(input())
print(rgb2html(a,b,c))