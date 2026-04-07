public class Binsearch {
    public static int binarySearch(int[] arr, int target) {
        int lo = 0, hi = arr.length - 1;
        while (lo <= hi) {
            int mid = lo + (hi - lo) / 2;
            if (arr[mid] == target) return mid;
            else if (arr[mid] < target) lo = mid + 1;
            else hi = mid - 1;
        }
        return -1;
    }

    public static void main(String[] args) {
        int[] sorted = {1, 3, 5, 7, 9, 11, 13};
        int[] targets = {7, 8};
        for (int t : targets) {
            int idx = binarySearch(sorted, t);
            if (idx >= 0) {
                System.out.printf("%d found at index %d%n", t, idx);
            } else {
                System.out.printf("%d not found%n", t);
            }
        }
    }
}
