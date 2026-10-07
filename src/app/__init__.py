import os

# Инференс одной строки быстрее без потоков OpenMP (меньше накладных расходов)
os.environ.setdefault("OMP_NUM_THREADS", "1")
