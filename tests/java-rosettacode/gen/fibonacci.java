
public class Fibonacci {

    public static long fib(int n) {
        if (n < 2) {
            return n;
        }
        return fib(n - 1) + fib(n - 2);

    }

    public static void main(String[] args) {
        for (var i = 1; i <= 16; ++i) {
            System.out.printf("%d ", fib(i));
        }
        System.out.println();

    }
}
