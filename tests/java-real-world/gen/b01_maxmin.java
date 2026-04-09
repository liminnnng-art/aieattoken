
public class B01_maxmin.aet {

    public static int findMax(int[] arr) {
        var max = arr[0];
        for (var i = 1; i < arr.length; ++i) {
            if (arr[i] > max) {
                max = arr[i];
            }
        }
        return max;

    }

    public static int findMin(int[] arr) {
        var min = arr[0];
        for (var i = 1; i < arr.length; ++i) {
            if (arr[i] < min) {
                min = arr[i];
            }
        }
        return min;

    }

    public static int[] findMaxMin(int[] arr) {
        if (arr == null || arr.length == 0) {
            throw new IllegalArgumentException("Array must not be empty");
        }
        return new int[]{findMax(arr), findMin(arr)};

    }

    public static void main(String[] args) {
        var data = new int[]{38, 7, 102, -4, 56, 23, 0, 91, -15, 44};
        var result = findMaxMin(data);
        System.out.println("Array: [38, 7, 102, -4, 56, 23, 0, 91, -15, 44]");
        System.out.println("Max: " + result[0]);
        System.out.println("Min: " + result[1]);
        System.out.println("Max correct: " + (result[0] == 102 ? "PASS" : "FAIL"));
        System.out.println("Min correct: " + (result[1] == -15 ? "PASS" : "FAIL"));
        var single = new int[]{42};
        var r2 = findMaxMin(single);
        System.out.println("Single element max==min: " + (r2[0] == 42 && r2[1] == 42 ? "PASS" : "FAIL"));
        try {
            findMaxMin(new int[0]);
            System.out.println("Empty array exception: FAIL");

        } catch (IllegalArgumentException e) {
            System.out.println("Empty array exception: PASS");

        }

    }
}
