# Linguagem sem gramática AST: deve cair no fallback regex (não aparece no Map).
def classify(n, flag):
    result = 0
    if n > 10:
        for i in range(n):
            if i % 2 == 0 and flag:
                result += i
    return result
