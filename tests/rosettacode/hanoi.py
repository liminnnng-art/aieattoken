# Towers of Hanoi - 4 disks
def hanoi(n, frm, to, via):
    if n == 1:
        print(f"Move disk 1 from {frm} to {to}")
        return
    hanoi(n - 1, frm, via, to)
    print(f"Move disk {n} from {frm} to {to}")
    hanoi(n - 1, via, to, frm)

hanoi(4, "A", "C", "B")
