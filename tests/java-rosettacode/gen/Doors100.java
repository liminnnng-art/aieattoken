
public class Doors100.aet {

    public static void main(String[] args) {
        var doors = new boolean[101];
        for (var pass = 1; pass <= 100; ++pass) {
            for (var door = pass; door <= 100; door += pass) {
                doors[door] = !doors[door];
            }
        }
        for (var i = 1; i <= 100; ++i) {
            if (doors[i]) {
                System.out.printf("Door %d is open%n", i);
            }
        }

    }
}
