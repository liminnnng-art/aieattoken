import React, { useState, useEffect } from "react";

interface CounterProps {
  initial: number;
  step: number;
}

const Counter: React.FC<CounterProps> = ({ initial, step }) => {
  const [count, setCount] = useState<number>(initial);

  useEffect(() => {
    document.title = "Count: " + count;
  }, [count]);

  const increment = () => setCount(count + step);
  const decrement = () => setCount(count - step);
  const reset = () => setCount(initial);

  return (
    <div className="counter">
      <h1>Count: {count}</h1>
      <button onClick={increment}>+{step}</button>
      <button onClick={decrement}>-{step}</button>
      <button onClick={reset}>Reset</button>
    </div>
  );
};

export default Counter;
