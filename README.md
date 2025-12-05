# MACS – Memory-Aware CPU Scheduler

## 1. Project Title
MACS – Memory-Aware CPU Scheduler

## 2. Description
MACS is a simulation and visualization tool that compares a standard CPU scheduling approach (Baseline Round-Robin) with a Memory-Aware scheduling algorithm. The system dynamically adjusts CPU quantum sizes based on estimated process memory behavior, allowing users to analyze performance under constrained memory environments. The frontend provides interactive charts, Gantt timelines, tables, and configuration panels, while the backend performs full scheduling simulations.

## 3. Features
- Interactive configuration of system parameters and process list  
- Baseline and Memory-Aware CPU scheduling simulations  
- Visualizations including CPU Utilization Graphs, Per-PID Stacked Timeline, Dual Gantt Charts, Performance Comparison  
- Local run history saving  
- Excel input import and JSON export  
- Dark/Light theme  
- FastAPI backend with simulation engine

## 4. Installation

### Clone Repository
```
git clone https://github.com/Tarundahiya7/MACS.git
cd MACS
```

## 5. Usage

### Backend
```
cd backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend
```
cd frontend
npm install
npm run dev
```

## 6. Configuration
JSON input structure for simulation:
```
{
  "system": { ... },
  "processes": [ ... ]
}
```

## 7. Project Structure
```
MACS/
├── backend/
├── frontend/
└── README.md
```

## 8. Technologies Used
**Frontend:** React.js, Tailwind CSS, Recharts  
**Backend:** FastAPI, Pydantic, SQLAlchemy  
**Other:** JSON, Excel Import  

## 9. Contributing
1. Fork  
2. Create branch  
3. Commit  
4. Submit PR
