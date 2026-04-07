package main

import (
	"sync"
	"testing"
	"time"
)

func TestKVStoreSetGet(t *testing.T) {
	store := NewKVStore()
	store.Set("key1", "value1")
	val, err := store.Get("key1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if val != "value1" {
		t.Errorf("Get(key1) = %s, want value1", val)
	}
}

func TestKVStoreGetMissing(t *testing.T) {
	store := NewKVStore()
	_, err := store.Get("nonexistent")
	if err == nil {
		t.Error("expected error for missing key")
	}
}

func TestKVStoreDelete(t *testing.T) {
	store := NewKVStore()
	store.Set("key1", "value1")
	err := store.Delete("key1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	_, err = store.Get("key1")
	if err == nil {
		t.Error("expected error after delete")
	}
}

func TestKVStoreDeleteMissing(t *testing.T) {
	store := NewKVStore()
	err := store.Delete("nonexistent")
	if err == nil {
		t.Error("expected error for deleting missing key")
	}
}

func TestKVStoreKeys(t *testing.T) {
	store := NewKVStore()
	store.Set("a", "1")
	store.Set("b", "2")
	store.Set("c", "3")
	keys := store.Keys()
	if len(keys) != 3 {
		t.Errorf("Keys() returned %d keys, want 3", len(keys))
	}
}

func TestKVStoreLen(t *testing.T) {
	store := NewKVStore()
	if store.Len() != 0 {
		t.Errorf("empty store Len() = %d, want 0", store.Len())
	}
	store.Set("a", "1")
	store.Set("b", "2")
	if store.Len() != 2 {
		t.Errorf("Len() = %d, want 2", store.Len())
	}
}

func TestKVStoreTTLExpiry(t *testing.T) {
	store := NewKVStore()
	store.SetWithTTL("temp", "data", 50*time.Millisecond)
	val, err := store.Get("temp")
	if err != nil {
		t.Fatalf("should not be expired yet: %v", err)
	}
	if val != "data" {
		t.Errorf("Get(temp) = %s, want data", val)
	}
	time.Sleep(100 * time.Millisecond)
	_, err = store.Get("temp")
	if err == nil {
		t.Error("expected error for expired key")
	}
}

func TestKVStoreCleanup(t *testing.T) {
	store := NewKVStore()
	store.SetWithTTL("exp1", "a", 50*time.Millisecond)
	store.SetWithTTL("exp2", "b", 50*time.Millisecond)
	store.Set("keep", "c")
	time.Sleep(100 * time.Millisecond)
	removed := store.Cleanup()
	if removed != 2 {
		t.Errorf("Cleanup() removed %d, want 2", removed)
	}
	if store.Len() != 1 {
		t.Errorf("after cleanup Len() = %d, want 1", store.Len())
	}
}

func TestKVStoreConcurrent(t *testing.T) {
	store := NewKVStore()
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			key := "key"
			store.Set(key, "val")
			store.Get(key)
		}(i)
	}
	wg.Wait()
}

func BenchmarkKVStoreSet(b *testing.B) {
	store := NewKVStore()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		store.Set("key", "value")
	}
}

func BenchmarkKVStoreGet(b *testing.B) {
	store := NewKVStore()
	store.Set("key", "value")
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		store.Get("key")
	}
}

func BenchmarkKVStoreSetGet(b *testing.B) {
	store := NewKVStore()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		store.Set("key", "value")
		store.Get("key")
	}
}
