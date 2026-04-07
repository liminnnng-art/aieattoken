public class Hanoi {
    public static void move(int n, String from, String to, String via) {
        if (n == 1) {
            System.out.printf("Move disk 1 from %s to %s%n", from, to);
            return;
        }
        move(n - 1, from, via, to);
        System.out.printf("Move disk %d from %s to %s%n", n, from, to);
        move(n - 1, via, to, from);
    }

    public static void main(String[] args) {
        int disks = 4;
        System.out.println("Towers of Hanoi with " + disks + " disks:");
        move(disks, "A", "C", "B");
    }
}
