
public class Gcd.aet {

    public static int gcd(int a, int b) {
        while (b != 0) {
            var temp = b;
            b = a % b;
            a = temp;
        }
        return a;

    }

    public static void main(String[] args) {
        System.out.println(gcd(40902, 24140));

    }
}
