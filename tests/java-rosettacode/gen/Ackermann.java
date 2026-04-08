
public class Ackermann {

    public static int ackermann(int m, int n) {
        if (m == 0) {
            return n + 1;
        }
        if (n == 0) {
            return ackermann(m - 1, 1);
        }
        return ackermann(m - 1, ackermann(m, n - 1));

    }

    public static void main(String[] args) {
        for (var m = 0; m <= 3; m++) {
            for (var n = 0; n <= 4; n++) {
                System.out.printf("A(%d,%d) = %d%n", m, n, ackermann(m, n));
            }
        }

    }
}
