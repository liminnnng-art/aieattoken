import java.util.Arrays;

public class Bubblesort {
    public static void bubbleSort(int[] arr) {
        int n = arr.length;
        boolean swapped;
        for (int i = 0; i < n - 1; i++) {
            swapped = false;
            for (int j = 0; j < n - 1 - i; j++) {
                if (arr[j] > arr[j + 1]) {
                    int temp = arr[j];
                    arr[j] = arr[j + 1];
                    arr[j + 1] = temp;
                    swapped = true;
                }
            }
            if (!swapped) break;
        }
    }

    public static void main(String[] args) {
        int[] data = {5, 3, 8, 6, 2, 7, 1, 4};
        System.out.println("Before: " + Arrays.toString(data));
        bubbleSort(data);
        System.out.println("After:  " + Arrays.toString(data));
    }
}
