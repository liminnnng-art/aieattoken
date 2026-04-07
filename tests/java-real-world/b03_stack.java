import java.util.ArrayList;
import java.util.EmptyStackException;

public class b03_stack {

    static class GenericStack<T> {
        private final ArrayList<T> items = new ArrayList<>();

        void push(T item) { items.add(item); }

        T pop() {
            if (isEmpty()) throw new EmptyStackException();
            return items.remove(items.size() - 1);
        }

        T peek() {
            if (isEmpty()) throw new EmptyStackException();
            return items.get(items.size() - 1);
        }

        boolean isEmpty() { return items.isEmpty(); }
        int size() { return items.size(); }
    }

    public static void main(String[] args) {
        GenericStack<Integer> stack = new GenericStack<>();
        System.out.println("Empty: " + (stack.isEmpty() ? "PASS" : "FAIL"));

        stack.push(10); stack.push(20); stack.push(30);
        System.out.println("Size after 3 pushes: " + (stack.size() == 3 ? "PASS" : "FAIL"));
        System.out.println("Peek: " + (stack.peek() == 30 ? "PASS" : "FAIL"));
        System.out.println("Pop: " + (stack.pop() == 30 ? "PASS" : "FAIL"));
        System.out.println("Pop: " + (stack.pop() == 20 ? "PASS" : "FAIL"));
        System.out.println("Pop: " + (stack.pop() == 10 ? "PASS" : "FAIL"));
        System.out.println("Empty after pops: " + (stack.isEmpty() ? "PASS" : "FAIL"));

        try { stack.pop(); System.out.println("Pop empty: FAIL"); }
        catch (EmptyStackException e) { System.out.println("Pop empty throws: PASS"); }

        // Test with String type
        GenericStack<String> sStack = new GenericStack<>();
        sStack.push("hello"); sStack.push("world");
        System.out.println("String peek: " + ("world".equals(sStack.peek()) ? "PASS" : "FAIL"));
    }
}
