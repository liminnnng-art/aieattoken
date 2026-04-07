package main

import (
	"fmt"
	"sync"
	"time"
)

type Entry struct {
	Value     string
	CreatedAt time.Time
	TTL       time.Duration
}

func (e Entry) IsExpired() bool {
	if e.TTL == 0 {
		return false
	}
	return time.Since(e.CreatedAt) > e.TTL
}

type KVStore struct {
	mu   sync.RWMutex
	data map[string]Entry
}

func NewKVStore() *KVStore {
	return &KVStore{data: make(map[string]Entry)}
}

func (kv *KVStore) Set(key, value string) {
	kv.mu.Lock()
	defer kv.mu.Unlock()
	kv.data[key] = Entry{
		Value:     value,
		CreatedAt: time.Now(),
	}
}

func (kv *KVStore) SetWithTTL(key, value string, ttl time.Duration) {
	kv.mu.Lock()
	defer kv.mu.Unlock()
	kv.data[key] = Entry{
		Value:     value,
		CreatedAt: time.Now(),
		TTL:       ttl,
	}
}

func (kv *KVStore) Get(key string) (string, error) {
	kv.mu.RLock()
	defer kv.mu.RUnlock()
	entry, ok := kv.data[key]
	if !ok {
		return "", fmt.Errorf("key not found: %s", key)
	}
	if entry.IsExpired() {
		return "", fmt.Errorf("key expired: %s", key)
	}
	return entry.Value, nil
}

func (kv *KVStore) Delete(key string) error {
	kv.mu.Lock()
	defer kv.mu.Unlock()
	if _, ok := kv.data[key]; !ok {
		return fmt.Errorf("key not found: %s", key)
	}
	delete(kv.data, key)
	return nil
}

func (kv *KVStore) Keys() []string {
	kv.mu.RLock()
	defer kv.mu.RUnlock()
	keys := make([]string, 0, len(kv.data))
	for k, e := range kv.data {
		if !e.IsExpired() {
			keys = append(keys, k)
		}
	}
	return keys
}

func (kv *KVStore) Len() int {
	return len(kv.Keys())
}

func (kv *KVStore) Cleanup() int {
	kv.mu.Lock()
	defer kv.mu.Unlock()
	removed := 0
	for k, e := range kv.data {
		if e.IsExpired() {
			delete(kv.data, k)
			removed++
		}
	}
	return removed
}

func main() {
	store := NewKVStore()
	store.Set("name", "Alice")
	store.Set("role", "admin")
	store.SetWithTTL("session", "abc123", 5*time.Second)

	val, err := store.Get("name")
	if err != nil {
		fmt.Println("Error:", err)
	} else {
		fmt.Printf("name = %s\n", val)
	}

	fmt.Printf("Keys: %v\n", store.Keys())
	fmt.Printf("Count: %d\n", store.Len())

	err = store.Delete("role")
	if err != nil {
		fmt.Println("Delete error:", err)
	}
	fmt.Printf("After delete, keys: %v\n", store.Keys())
}
