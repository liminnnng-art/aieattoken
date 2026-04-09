
public class Matrix.aet {

    public static int[][] multiply(int[][] a, int[][] b) {
        var rows = a.length;
        var cols = b[0].length;
        var inner = b.length;
        var result = new int[rows][cols];
        for (var i = 0; i < rows; ++i) {
            for (var j = 0; j < cols; ++j) {
                for (var k = 0; k < inner; ++k) {
                    result[i][j] += a[i][k] * b[k][j];
                }
            }
        }
        return result;

    }

    public static void printMatrix(String label, int[][] m) {
        System.out.println(label);
        for (var row : m) {
            System.out.printf("  [%d, %d]%n", row[0], row[1]);
        }

    }

    public static void main(String[] args) {
        var a = new int[][]{new int[]{1, 2}, new int[]{3, 4}};
        var b = new int[][]{new int[]{5, 6}, new int[]{7, 8}};
        var c = multiply(a, b);
        printMatrix("A:", a);
        printMatrix("B:", b);
        printMatrix("A * B:", c);

    }
}
