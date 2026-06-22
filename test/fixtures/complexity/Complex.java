package com.acme;

public class Complex {
    // classify: ciclomática hand-counted = 8 (1 base + if + for + if + && + else-if + while + ||)
    // maxNesting = 3 (if -> for -> if)
    public int classify(int n, boolean flag) {
        int result = 0;
        if (n > 10) {
            for (int i = 0; i < n; i++) {
                if (i % 2 == 0 && flag) {
                    result += i;
                }
            }
        } else if (n < 0) {
            result = -1;
        }
        while (result > 100 || flag) {
            result -= 10;
        }
        return result;
    }

    // simple: ciclomática = 1, sem aninhamento
    public void simple() {
        System.out.println("hi");
    }
}
