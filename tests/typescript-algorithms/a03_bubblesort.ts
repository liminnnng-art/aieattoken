function bubbleSort(arr: number[]): number[] {
  const result = [...arr];
  const n = result.length;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - i - 1; j++) {
      if (result[j] > result[j + 1]) {
        const tmp = result[j];
        result[j] = result[j + 1];
        result[j + 1] = tmp;
      }
    }
  }
  return result;
}

function main(): void {
  const data = [5, 2, 8, 1, 9, 3, 7, 4, 6];
  const sorted = bubbleSort(data);
  console.log(sorted.join(","));
}

main();
