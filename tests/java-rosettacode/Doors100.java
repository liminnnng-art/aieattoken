public class Doors100 {
    public static void main(String[] args) {
        boolean[] doors = new boolean[101];
        for (int pass = 1; pass <= 100; pass++) {
            for (int door = pass; door <= 100; door += pass) {
                doors[door] = !doors[door];
            }
        }
        for (int i = 1; i <= 100; i++) {
            if (doors[i]) System.out.printf("Door %d is open%n", i);
        }
    }
}
