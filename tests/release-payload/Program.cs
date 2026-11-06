using System.IO.Compression;
using MultiServer;

var root=Path.Combine(Path.GetTempPath(),"release-payload-tests-"+Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(root);
string active=Path.Combine(root,"active"),target=Path.Combine(root,"new"),zip=Path.Combine(root,"payload.zip");
void Require(bool value,string message){if(!value)throw new Exception(message);}
void Old(string name,string value){var file=Path.Combine(active,name);Directory.CreateDirectory(Path.GetDirectoryName(file)!);File.WriteAllText(file,value);}
Old("runtime/same.bin","identical-runtime");Old("node_modules/changed.js","old-dependency");Old("apps/source.js","same-app");
using(var archive=ZipFile.Open(zip,ZipArchiveMode.Create)){
 foreach(var item in new[]{("runtime/same.bin","identical-runtime"),("node_modules/changed.js","new-dependency"),("apps/source.js","same-app"),("runtime/new.bin","new-runtime")}){
  using var writer=new StreamWriter(archive.CreateEntry(item.Item1).Open());writer.Write(item.Item2);
 }
}
using(var archive=ZipFile.OpenRead(zip)){
 var result=ReleasePayload.Extract(archive,target,active);
 Require(result.LinkedFiles==1&&result.ReusedBytes==new FileInfo(Path.Combine(active,"runtime/same.bin")).Length,"Only byte-identical runtime may be linked");
}
Require(File.ReadAllText(Path.Combine(active,"node_modules/changed.js"))=="old-dependency","Active dependency changed");
Require(File.ReadAllText(Path.Combine(target,"node_modules/changed.js"))=="new-dependency","Changed dependency was not extracted");
File.Delete(Path.Combine(active,"runtime/same.bin"));
Require(File.ReadAllText(Path.Combine(target,"runtime/same.bin"))=="identical-runtime","Deleting old release removed linked content");
Require(File.ReadAllText(Path.Combine(target,"runtime/new.bin"))=="new-runtime","New runtime missing");
string unsafeZip=Path.Combine(root,"unsafe.zip"),unsafeTarget=Path.Combine(root,"unsafe-target");
using(var archive=ZipFile.Open(unsafeZip,ZipArchiveMode.Create)){
 archive.CreateEntry("runtime/first.bin");archive.CreateEntry("../escape.bin");
}
bool rejected=false;
try{using var archive=ZipFile.OpenRead(unsafeZip);ReleasePayload.Extract(archive,unsafeTarget,active);}catch(IOException){rejected=true;}
Require(rejected&&!Directory.Exists(unsafeTarget)&&!File.Exists(Path.Combine(root,"escape.bin")),"Traversal was not rejected before extraction");
Console.WriteLine("PASS: identical runtime shared; changed/new files extracted; active files preserved; old-release deletion preserves shared bytes; traversal rejected before writes.");
Console.WriteLine("Fixtures: "+root);
