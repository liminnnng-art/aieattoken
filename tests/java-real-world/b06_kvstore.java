import java.util.*;

public class b06_kvstore {

    static class KVStore<K, V> {
        private final Map<K, V> store = new LinkedHashMap<>();
        private int opCount = 0;

        void put(K key, V value) {
            Objects.requireNonNull(key, "Key must not be null");
            store.put(key, value);
            opCount++;
        }

        Optional<V> get(K key) {
            return Optional.ofNullable(store.get(key));
        }

        boolean has(K key) {
            return store.containsKey(key);
        }

        boolean delete(K key) {
            boolean existed = store.containsKey(key);
            store.remove(key);
            if (existed) opCount++;
            return existed;
        }

        int size() { return store.size(); }
        int getOpCount() { return opCount; }
        Set<K> keys() { return Collections.unmodifiableSet(store.keySet()); }
        Collection<V> values() { return Collections.unmodifiableCollection(store.values()); }

        List<Map.Entry<K, V>> entries() {
            return new ArrayList<>(store.entrySet());
        }

        void clear() {
            store.clear();
            opCount++;
        }

        @Override
        public String toString() {
            StringBuilder sb = new StringBuilder("KVStore{");
            int i = 0;
            for (var entry : store.entrySet()) {
                if (i > 0) sb.append(", ");
                sb.append(entry.getKey()).append("=").append(entry.getValue());
                i++;
            }
            sb.append("}");
            return sb.toString();
        }
    }

    static int passed = 0, failed = 0;

    static void check(String label, boolean condition) {
        if (condition) {
            System.out.println("  " + label + ": PASS");
            passed++;
        } else {
            System.out.println("  " + label + ": FAIL");
            failed++;
        }
    }

    public static void main(String[] args) {
        System.out.println("=== String/Integer KVStore ===");
        KVStore<String, Integer> store = new KVStore<>();

        check("Initially empty", store.size() == 0);

        store.put("alpha", 1);
        store.put("beta", 2);
        store.put("gamma", 3);
        check("Size after 3 puts", store.size() == 3);

        check("Get alpha", store.get("alpha").orElse(-1) == 1);
        check("Get beta", store.get("beta").orElse(-1) == 2);
        check("Get missing key", store.get("delta").isEmpty());
        check("Has alpha", store.has("alpha"));
        check("Has not delta", !store.has("delta"));

        store.put("beta", 22);
        check("Update beta", store.get("beta").orElse(-1) == 22);
        check("Size after update", store.size() == 3);

        check("Delete alpha", store.delete("alpha"));
        check("Alpha gone", !store.has("alpha"));
        check("Size after delete", store.size() == 2);
        check("Delete nonexistent", !store.delete("zzz"));

        System.out.println("  Keys: " + store.keys());
        check("Keys correct", store.keys().containsAll(Set.of("beta", "gamma")));

        System.out.println("  Store: " + store);

        System.out.println("\n=== Integer/String KVStore ===");
        KVStore<Integer, String> intStore = new KVStore<>();
        intStore.put(1, "one");
        intStore.put(2, "two");
        intStore.put(3, "three");
        check("Int key get", "two".equals(intStore.get(2).orElse("")));
        check("Int key has", intStore.has(3));

        intStore.clear();
        check("Clear empties store", intStore.size() == 0);

        System.out.println("\n=== Null Key Handling ===");
        try {
            store.put(null, 99);
            check("Null key throws", false);
        } catch (NullPointerException e) {
            check("Null key throws NPE", true);
        }

        System.out.println("\n=== Entries Test ===");
        KVStore<String, String> eStore = new KVStore<>();
        eStore.put("x", "10");
        eStore.put("y", "20");
        var entries = eStore.entries();
        check("Entries size", entries.size() == 2);
        check("First entry key", "x".equals(entries.get(0).getKey()));

        System.out.printf("%n=== Results: %d passed, %d failed ===%n", passed, failed);
    }
}
