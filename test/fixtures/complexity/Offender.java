package com.acme;

public class Offender {
    // deep: profundamente aninhada — cognitiva e aninhamento acima do limite.
    // cyclomatic = 7 (1 + for + if + if + if + while + if)
    // maxNesting = 6, cognitive = 21 → ofensora (cognitiva>15 e aninhamento>4)
    public int deep(int[] xs, boolean a, boolean b) {
        int r = 0;
        for (int i = 0; i < xs.length; i++) {
            if (xs[i] > 0) {
                if (a) {
                    if (b) {
                        while (r < 10) {
                            if (r % 2 == 0) {
                                r += xs[i];
                            }
                        }
                    }
                }
            }
        }
        return r;
    }
}
