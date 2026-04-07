public class b01_maxmin {

    static int findMax(int[] arr) {
        int max = arr[0];
        for (int i = 1; i < arr.length; i++) {
            if (arr[i] > max) max = arr[i];
        }
        return max;
    }

    static int findMin(int[] arr) {
        int min = arr[0];
        for (int i = 1; i < arr.length; i++) {
            if (arr[i] < min) min = arr[i];
        }
        return min;
    }

    static int[] findMaxMin(int[] arr) {
        if (arr == null || arr.length == 0) {
            throw new IllegalArgumentException("Array must not be empty");
        }
        return new int[]{findMax(arr), findMin(arr)};
    }

    public static void main(String[] args) {
        int[] data = {38, 7, 102, -4, 56, 23, 0, 91, -15, 44};
        int[] result = findMaxMin(data);
        System.out.println("Array: [38, 7, 102, -4, 56, 23, 0, 91, -15, 44]");
        System.out.println("Max: " + result[0]);
        System.out.println("Min: " + result[1]);
        System.out.println("Max correct: " + (result[0] == 102 ? "PASS" : "FAIL"));
        System.out.println("Min correct: " + (result[1] == -15 ? "PASS" : "FAIL"));

        // Edge case: single element
        int[] single = {42};
        int[] r2 = findMaxMin(single);
        System.out.println("Single element max==min: " + (r2[0] == 42 && r2[1] == 42 ? "PASS" : "FAIL"));

        // Edge case: empty array
        try {
            findMaxMin(new int[]{});
            System.out.println("Empty array exception: FAIL");
        } catch (IllegalArgumentException e) {
            System.out.println("Empty array exception: PASS");
        }
    }
}
