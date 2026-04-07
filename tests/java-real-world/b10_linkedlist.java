import java.util.Iterator;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.StringJoiner;

public class b10_linkedlist {

    static class DoublyLinkedList<T> implements Iterable<T> {
        private static class Node<T> {
            T data;
            Node<T> prev;
            Node<T> next;
            Node(T data) { this.data = data; }
        }

        private Node<T> head;
        private Node<T> tail;
        private int size;

        // Add to end
        void add(T item) {
            Node<T> node = new Node<>(item);
            if (tail == null) {
                head = tail = node;
            } else {
                tail.next = node;
                node.prev = tail;
                tail = node;
            }
            size++;
        }

        // Add at front
        void addFirst(T item) {
            Node<T> node = new Node<>(item);
            if (head == null) {
                head = tail = node;
            } else {
                node.next = head;
                head.prev = node;
                head = node;
            }
            size++;
        }

        // Add at index
        void addAt(int index, T item) {
            if (index < 0 || index > size) throw new IndexOutOfBoundsException("Index: " + index);
            if (index == 0) { addFirst(item); return; }
            if (index == size) { add(item); return; }
            Node<T> current = getNode(index);
            Node<T> node = new Node<>(item);
            node.prev = current.prev;
            node.next = current;
            current.prev.next = node;
            current.prev = node;
            size++;
        }

        // Get element at index
        T get(int index) {
            return getNode(index).data;
        }

        // Set element at index
        T set(int index, T item) {
            Node<T> node = getNode(index);
            T old = node.data;
            node.data = item;
            return old;
        }

        // Remove by index
        T removeAt(int index) {
            Node<T> node = getNode(index);
            return unlinkNode(node);
        }

        // Remove first occurrence of value
        boolean remove(T item) {
            Node<T> current = head;
            while (current != null) {
                if (Objects.equals(current.data, item)) {
                    unlinkNode(current);
                    return true;
                }
                current = current.next;
            }
            return false;
        }

        // Remove all occurrences
        int removeAll(T item) {
            int count = 0;
            Node<T> current = head;
            while (current != null) {
                Node<T> next = current.next;
                if (Objects.equals(current.data, item)) {
                    unlinkNode(current);
                    count++;
                }
                current = next;
            }
            return count;
        }

        private T unlinkNode(Node<T> node) {
            T data = node.data;
            if (node.prev != null) {
                node.prev.next = node.next;
            } else {
                head = node.next;
            }
            if (node.next != null) {
                node.next.prev = node.prev;
            } else {
                tail = node.prev;
            }
            size--;
            return data;
        }

        private Node<T> getNode(int index) {
            if (index < 0 || index >= size) throw new IndexOutOfBoundsException("Index: " + index + ", Size: " + size);
            Node<T> current;
            if (index < size / 2) {
                current = head;
                for (int i = 0; i < index; i++) current = current.next;
            } else {
                current = tail;
                for (int i = size - 1; i > index; i--) current = current.prev;
            }
            return current;
        }

        // indexOf: first occurrence
        int indexOf(T item) {
            Node<T> current = head;
            int index = 0;
            while (current != null) {
                if (Objects.equals(current.data, item)) return index;
                current = current.next;
                index++;
            }
            return -1;
        }

        // lastIndexOf
        int lastIndexOf(T item) {
            Node<T> current = tail;
            int index = size - 1;
            while (current != null) {
                if (Objects.equals(current.data, item)) return index;
                current = current.prev;
                index--;
            }
            return -1;
        }

        boolean contains(T item) { return indexOf(item) >= 0; }
        int size() { return size; }
        boolean isEmpty() { return size == 0; }

        T getFirst() {
            if (head == null) throw new NoSuchElementException();
            return head.data;
        }

        T getLast() {
            if (tail == null) throw new NoSuchElementException();
            return tail.data;
        }

        // Reverse in place
        void reverse() {
            Node<T> current = head;
            Node<T> temp;
            while (current != null) {
                temp = current.next;
                current.next = current.prev;
                current.prev = temp;
                current = temp;
            }
            temp = head;
            head = tail;
            tail = temp;
        }

        void clear() {
            head = tail = null;
            size = 0;
        }

        // Convert to array
        Object[] toArray() {
            Object[] arr = new Object[size];
            Node<T> current = head;
            int i = 0;
            while (current != null) {
                arr[i++] = current.data;
                current = current.next;
            }
            return arr;
        }

        @Override
        public Iterator<T> iterator() {
            return new Iterator<>() {
                private Node<T> current = head;

                @Override public boolean hasNext() { return current != null; }

                @Override
                public T next() {
                    if (!hasNext()) throw new NoSuchElementException();
                    T data = current.data;
                    current = current.next;
                    return data;
                }
            };
        }

        // Reverse iterator
        Iterator<T> reverseIterator() {
            return new Iterator<>() {
                private Node<T> current = tail;

                @Override public boolean hasNext() { return current != null; }

                @Override
                public T next() {
                    if (!hasNext()) throw new NoSuchElementException();
                    T data = current.data;
                    current = current.prev;
                    return data;
                }
            };
        }

        @Override
        public String toString() {
            StringJoiner sj = new StringJoiner(", ", "[", "]");
            for (T item : this) sj.add(String.valueOf(item));
            return sj.toString();
        }
    }

    static int passed = 0, failed = 0;

    static void check(String label, boolean condition) {
        String status = condition ? "PASS" : "FAIL";
        System.out.println("  " + label + ": " + status);
        if (condition) passed++; else failed++;
    }

    public static void main(String[] args) {
        System.out.println("=== Basic Operations ===");
        DoublyLinkedList<Integer> list = new DoublyLinkedList<>();
        check("New list is empty", list.isEmpty());
        check("New list size 0", list.size() == 0);

        list.add(10);
        list.add(20);
        list.add(30);
        System.out.println("  List: " + list);
        check("Size after adds", list.size() == 3);
        check("Get 0", list.get(0) == 10);
        check("Get 1", list.get(1) == 20);
        check("Get 2", list.get(2) == 30);
        check("First", list.getFirst() == 10);
        check("Last", list.getLast() == 30);

        System.out.println("\n=== AddFirst / AddAt ===");
        list.addFirst(5);
        System.out.println("  After addFirst(5): " + list);
        check("AddFirst", list.getFirst() == 5);
        check("Size", list.size() == 4);

        list.addAt(2, 15);
        System.out.println("  After addAt(2, 15): " + list);
        check("AddAt index 2", list.get(2) == 15);
        check("Size", list.size() == 5);

        System.out.println("\n=== Set ===");
        int old = list.set(2, 99);
        System.out.println("  After set(2, 99): " + list);
        check("Set returns old value", old == 15);
        check("Set new value", list.get(2) == 99);

        System.out.println("\n=== Remove ===");
        list.set(2, 15); // restore
        int removed = list.removeAt(2);
        System.out.println("  After removeAt(2): " + list);
        check("RemoveAt returns value", removed == 15);
        check("Size after remove", list.size() == 4);

        list.add(20); // now has 5, 10, 20, 30, 20
        System.out.println("  Before remove(20): " + list);
        check("Remove first 20", list.remove(20));
        System.out.println("  After remove(20): " + list);
        check("Size after remove", list.size() == 4);
        check("Second 20 still present", list.contains(20));

        System.out.println("\n=== IndexOf / Contains ===");
        DoublyLinkedList<String> slist = new DoublyLinkedList<>();
        slist.add("a"); slist.add("b"); slist.add("c"); slist.add("b"); slist.add("d");
        System.out.println("  String list: " + slist);
        check("indexOf b", slist.indexOf("b") == 1);
        check("lastIndexOf b", slist.lastIndexOf("b") == 3);
        check("indexOf missing", slist.indexOf("z") == -1);
        check("Contains c", slist.contains("c"));
        check("Not contains z", !slist.contains("z"));

        System.out.println("\n=== RemoveAll ===");
        slist.add("b");
        System.out.println("  Before removeAll(b): " + slist);
        int removedCount = slist.removeAll("b");
        System.out.println("  After removeAll(b): " + slist);
        check("RemoveAll count", removedCount == 3);
        check("No b remains", !slist.contains("b"));
        check("Size", slist.size() == 3);

        System.out.println("\n=== Reverse ===");
        DoublyLinkedList<Integer> rlist = new DoublyLinkedList<>();
        rlist.add(1); rlist.add(2); rlist.add(3); rlist.add(4); rlist.add(5);
        System.out.println("  Before reverse: " + rlist);
        rlist.reverse();
        System.out.println("  After reverse: " + rlist);
        check("Reversed first", rlist.getFirst() == 5);
        check("Reversed last", rlist.getLast() == 1);
        check("Reversed order", rlist.get(0) == 5 && rlist.get(1) == 4 && rlist.get(2) == 3);

        System.out.println("\n=== Iterator ===");
        StringBuilder forward = new StringBuilder();
        for (int val : rlist) forward.append(val).append(" ");
        System.out.println("  Forward: " + forward.toString().trim());
        check("Forward iteration", forward.toString().trim().equals("5 4 3 2 1"));

        StringBuilder backward = new StringBuilder();
        Iterator<Integer> rit = rlist.reverseIterator();
        while (rit.hasNext()) backward.append(rit.next()).append(" ");
        System.out.println("  Backward: " + backward.toString().trim());
        check("Reverse iteration", backward.toString().trim().equals("1 2 3 4 5"));

        System.out.println("\n=== For-each with Enhanced For ===");
        DoublyLinkedList<String> words = new DoublyLinkedList<>();
        words.add("hello"); words.add("world");
        StringBuilder sb = new StringBuilder();
        for (String w : words) sb.append(w).append(" ");
        check("For-each works", sb.toString().trim().equals("hello world"));

        System.out.println("\n=== Edge Cases ===");
        DoublyLinkedList<Integer> elist = new DoublyLinkedList<>();
        try { elist.get(0); check("Get on empty throws", false); }
        catch (IndexOutOfBoundsException e) { check("Get on empty throws", true); }

        try { elist.getFirst(); check("GetFirst on empty throws", false); }
        catch (NoSuchElementException e) { check("GetFirst on empty throws", true); }

        try { elist.removeAt(0); check("RemoveAt on empty throws", false); }
        catch (IndexOutOfBoundsException e) { check("RemoveAt on empty throws", true); }

        elist.add(42);
        check("Single element list", elist.size() == 1 && elist.getFirst() == 42 && elist.getLast() == 42);
        elist.removeAt(0);
        check("Remove only element", elist.isEmpty());

        // Null elements
        DoublyLinkedList<String> nlist = new DoublyLinkedList<>();
        nlist.add(null); nlist.add("a"); nlist.add(null);
        check("Contains null", nlist.contains(null));
        check("IndexOf null", nlist.indexOf(null) == 0);
        check("LastIndexOf null", nlist.lastIndexOf(null) == 2);
        check("Remove null", nlist.remove(null));
        check("Size after removing null", nlist.size() == 2);

        System.out.println("\n=== toArray ===");
        DoublyLinkedList<Integer> alist = new DoublyLinkedList<>();
        alist.add(10); alist.add(20); alist.add(30);
        Object[] arr = alist.toArray();
        check("Array length", arr.length == 3);
        check("Array values", (int)arr[0] == 10 && (int)arr[1] == 20 && (int)arr[2] == 30);

        System.out.println("\n=== Clear ===");
        alist.clear();
        check("Clear empties list", alist.isEmpty());
        check("Clear size 0", alist.size() == 0);

        System.out.printf("%n=== Results: %d passed, %d failed ===%n", passed, failed);
    }
}
