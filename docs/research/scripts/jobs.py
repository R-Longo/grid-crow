import json
meta=json.load(open("/tmp/claude-0/scratch/samples/meta.json"))
jobs=[]
fx=[("sun-card-34","SUNCARD","24x32",10),("sun-card-34","SUNCARD","16x20",6),("sun-card-45","SUNCARD45","16x20",6),("tarot","TAROT","16x20",10),("tarot","TAROT","18x24",10),("kitten","KITTEN","16x20",8),("crow","CROW","16x20",8)]
for f,l,s,m in fx: jobs.append([f,l,s,"portrait",m])
for tag,_ in meta:
    jobs.append([tag,tag[:3],"24x32","portrait",10]); jobs.append([tag,tag[:3],"16x20","portrait",8])
print(json.dumps(jobs))
