public class Matrix {
    public static int[][] multiply(int[][] a, int[][] b) {
        int rows = a.length;
        int cols = b[0].length;
        int inner = b.length;
        int[][] result = new int[rows][cols];
        for (int i = 0; i < rows; i++) {
            for (int j = 0; j < cols; j++) {
                for (int k = 0; k < inner; k++) {
                    result[i][j] += a[i][k] * b[k][j];
                }
            }
        }
        return result;
    }

    public static void printMatrix(String label, int[][] m) {
        System.out.println(label);
        for (int[] row : m) {
            System.out.printf("  [%d, %d]%n", row[0], row[1]);
        }
    }

    public static void main(String[] args) {
        int[][] a = {{1, 2}, {3, 4}};
        int[][] b = {{5, 6}, {7, 8}};
        int[][] c = multiply(a, b);
        printMatrix("A:", a);
        printMatrix("B:", b);
        printMatrix("A * B:", c);
    }
}
