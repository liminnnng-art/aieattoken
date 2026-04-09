from collections import defaultdict
def topological_sort(graph):
    visited = set()
    result = []
    def dfs(node):
        if node in visited: return
        visited.add(node)
        for neighbor in graph.get(node, []):
            dfs(neighbor)
        result.append(node)
    for node in graph:
        dfs(node)
    return list(reversed(result))
graph = {"des_system_lib": ["std","synopsys","std_cell_lib","dw02"],
         "dw01": ["dw02","std_cell_lib"],
         "dw02": ["std_cell_lib"],
         "std_cell_lib": ["std"],
         "synopsys": ["std"],
         "std": []}
print(topological_sort(graph))
