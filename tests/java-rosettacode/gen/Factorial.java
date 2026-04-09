
public class Factorial.aet {

    public static long factorial(int n) {
        if (n == 0) {
            return 1;
        }
        return n * factorial(n - 1);

    }

    public static void main(String[] args) {
        for (var i = 0; i <= 16; ++i) {
            System.out.printf("%d! = %d%n", i, factorial(i));
        }

    }
}
