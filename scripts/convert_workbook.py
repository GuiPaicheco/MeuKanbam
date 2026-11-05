"""Convert the original workbook into a PRIVATE JSON payload, never public assets.
Usage: python scripts/convert_workbook.py source.xlsx /outside/repo/import-private.json
Requires openpyxl. Dates without an explicit year remain unscheduled for review.
"""
import json, sys, uuid, re
from pathlib import Path
import openpyxl

def convert(path):
    workbook = openpyxl.load_workbook(path, data_only=True)
    sheet = workbook['Kanbam']
    priorities = {sheet.cell(r,9).fill.fgColor.rgb: str(sheet.cell(r,9).value).replace('PERMANENTE','permanent') for r in range(3,8)}
    tasks = []
    for col, status in [(2,'doing'),(3,'todo'),(4,'paused'),(5,'questions'),(6,'routine'),(7,'done')]:
        for row in range(3,sheet.max_row+1):
            cell = sheet.cell(row,col)
            if cell.value is None or str(cell.value).strip().upper() == 'EXCLUIR': continue
            text = str(cell.value).strip()
            percent = re.search(r'\b(\d{1,3})%', text)
            tasks.append(dict(id=str(uuid.uuid5(uuid.NAMESPACE_URL,f'meukanbam/planilha/{cell.coordinate}')),title=text[:300],description=text if len(text)>300 else '',status=status,priority=priorities.get(cell.fill.fgColor.rgb,'P3'),progress=100 if status=='done' else min(100,int(percent.group(1))) if percent else 0,assignee='',tags=['Importado da planilha'],subtasks=[],dependencies=[],links=[],comments=[],recurrence=''))
    events=[]
    sheet=workbook['Cronograma']
    for col,kind in [(3,'event'),(4,'absence')]:
        for row in range(4,sheet.max_row+1):
            value=sheet.cell(row,col).value
            if value is None or str(value).strip().upper()=='EXCLUIR':continue
            text=str(value).strip()
            events.append(dict(id=str(uuid.uuid5(uuid.NAMESPACE_URL,f'meukanbam/cronograma/{col}/{row}')),title=text.split('\n')[0][:300],description=text+'\n\nImportado: confirmar ano, data e horário antes de agendar.',kind=kind,start_date=None,end_date=None))
    return dict(tasks=tasks,events=events)

if __name__=='__main__':
    target=Path(sys.argv[2]).resolve()
    root=Path(__file__).resolve().parent.parent
    if target.is_relative_to(root): raise SystemExit('Salve os dados privados fora do repositório.')
    data=convert(sys.argv[1]); target.write_text(json.dumps(data,ensure_ascii=False,indent=2))
    print(f"Convertidas {len(data['tasks'])} tarefas e {len(data['events'])} registros do cronograma.")
