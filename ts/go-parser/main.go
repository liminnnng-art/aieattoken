package main

import (
	"encoding/json"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
)

// Node is the generic AST node representation for JSON output.
type Node map[string]interface{}

func main() {
	if len(os.Args) < 2 {
		outputError("usage: go-parser <file.go>")
		os.Exit(1)
	}

	filename := os.Args[1]

	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, filename, nil, parser.ParseComments)
	if err != nil {
		outputError(fmt.Sprintf("parse error: %v", err))
		os.Exit(1)
	}

	result := convertFile(fset, file)

	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	if err := enc.Encode(result); err != nil {
		outputError(fmt.Sprintf("json encode error: %v", err))
		os.Exit(1)
	}
}

func outputError(msg string) {
	enc := json.NewEncoder(os.Stderr)
	enc.SetIndent("", "  ")
	_ = enc.Encode(Node{"Kind": "Error", "Message": msg})
}

// posInfo returns line and column info for a position.
func posInfo(fset *token.FileSet, p token.Pos) Node {
	if !p.IsValid() {
		return nil
	}
	position := fset.Position(p)
	return Node{
		"Line":   position.Line,
		"Column": position.Column,
		"Offset": position.Offset,
	}
}

func convertFile(fset *token.FileSet, file *ast.File) Node {
	node := Node{
		"Kind":    "File",
		"Package": file.Name.Name,
		"Pos":     posInfo(fset, file.Pos()),
	}

	// Imports
	imports := []interface{}{}
	for _, imp := range file.Imports {
		imports = append(imports, convertImportSpec(fset, imp))
	}
	if len(imports) > 0 {
		node["Imports"] = imports
	}

	// Comments
	comments := []interface{}{}
	for _, cg := range file.Comments {
		comments = append(comments, convertCommentGroup(fset, cg))
	}
	if len(comments) > 0 {
		node["Comments"] = comments
	}

	// Declarations
	decls := []interface{}{}
	for _, decl := range file.Decls {
		decls = append(decls, convertDecl(fset, decl))
	}
	if len(decls) > 0 {
		node["Decls"] = decls
	}

	return node
}

func convertCommentGroup(fset *token.FileSet, cg *ast.CommentGroup) Node {
	if cg == nil {
		return nil
	}
	texts := []interface{}{}
	for _, c := range cg.List {
		texts = append(texts, Node{
			"Kind": "Comment",
			"Text": c.Text,
			"Pos":  posInfo(fset, c.Pos()),
		})
	}
	return Node{
		"Kind":     "CommentGroup",
		"Comments": texts,
	}
}

func convertImportSpec(fset *token.FileSet, imp *ast.ImportSpec) Node {
	node := Node{
		"Kind": "ImportSpec",
		"Path": imp.Path.Value,
		"Pos":  posInfo(fset, imp.Pos()),
	}
	if imp.Name != nil {
		node["Name"] = imp.Name.Name
	}
	if imp.Doc != nil {
		node["Doc"] = convertCommentGroup(fset, imp.Doc)
	}
	return node
}

func convertDecl(fset *token.FileSet, decl ast.Decl) interface{} {
	if decl == nil {
		return nil
	}
	switch d := decl.(type) {
	case *ast.FuncDecl:
		return convertFuncDecl(fset, d)
	case *ast.GenDecl:
		return convertGenDecl(fset, d)
	case *ast.BadDecl:
		return Node{"Kind": "BadDecl", "Pos": posInfo(fset, d.Pos())}
	default:
		return Node{"Kind": "UnknownDecl"}
	}
}

func convertFuncDecl(fset *token.FileSet, fn *ast.FuncDecl) Node {
	node := Node{
		"Kind": "FuncDecl",
		"Name": fn.Name.Name,
		"Pos":  posInfo(fset, fn.Pos()),
	}

	if fn.Doc != nil {
		node["Doc"] = convertCommentGroup(fset, fn.Doc)
	}

	// Receiver
	if fn.Recv != nil {
		node["Recv"] = convertFieldList(fset, fn.Recv)
	}

	// Function type (params + results)
	if fn.Type != nil {
		node["Type"] = convertFuncType(fset, fn.Type)
	}

	// Body
	if fn.Body != nil {
		node["Body"] = convertBlockStmt(fset, fn.Body)
	}

	return node
}

func convertGenDecl(fset *token.FileSet, gd *ast.GenDecl) Node {
	node := Node{
		"Kind":  "GenDecl",
		"Token": gd.Tok.String(),
		"Pos":   posInfo(fset, gd.Pos()),
	}

	if gd.Doc != nil {
		node["Doc"] = convertCommentGroup(fset, gd.Doc)
	}

	specs := []interface{}{}
	for _, spec := range gd.Specs {
		specs = append(specs, convertSpec(fset, spec))
	}
	node["Specs"] = specs

	return node
}

func convertSpec(fset *token.FileSet, spec ast.Spec) interface{} {
	if spec == nil {
		return nil
	}
	switch s := spec.(type) {
	case *ast.ImportSpec:
		return convertImportSpec(fset, s)
	case *ast.ValueSpec:
		return convertValueSpec(fset, s)
	case *ast.TypeSpec:
		return convertTypeSpec(fset, s)
	default:
		return Node{"Kind": "UnknownSpec"}
	}
}

func convertValueSpec(fset *token.FileSet, vs *ast.ValueSpec) Node {
	node := Node{
		"Kind": "ValueSpec",
		"Pos":  posInfo(fset, vs.Pos()),
	}

	if vs.Doc != nil {
		node["Doc"] = convertCommentGroup(fset, vs.Doc)
	}

	names := []interface{}{}
	for _, name := range vs.Names {
		names = append(names, name.Name)
	}
	node["Names"] = names

	if vs.Type != nil {
		node["Type"] = convertExpr(fset, vs.Type)
	}

	if vs.Values != nil {
		values := []interface{}{}
		for _, v := range vs.Values {
			values = append(values, convertExpr(fset, v))
		}
		node["Values"] = values
	}

	return node
}

func convertTypeSpec(fset *token.FileSet, ts *ast.TypeSpec) Node {
	node := Node{
		"Kind": "TypeSpec",
		"Name": ts.Name.Name,
		"Pos":  posInfo(fset, ts.Pos()),
	}

	if ts.Doc != nil {
		node["Doc"] = convertCommentGroup(fset, ts.Doc)
	}

	if ts.TypeParams != nil {
		node["TypeParams"] = convertFieldList(fset, ts.TypeParams)
	}

	node["Assign"] = ts.Assign.IsValid() // type alias if true

	if ts.Type != nil {
		node["Type"] = convertExpr(fset, ts.Type)
	}

	return node
}

// --- Expressions ---

func convertExpr(fset *token.FileSet, expr ast.Expr) interface{} {
	if expr == nil {
		return nil
	}
	switch e := expr.(type) {
	case *ast.Ident:
		return convertIdent(fset, e)
	case *ast.BasicLit:
		return convertBasicLit(fset, e)
	case *ast.CompositeLit:
		return convertCompositeLit(fset, e)
	case *ast.FuncLit:
		return convertFuncLit(fset, e)
	case *ast.BinaryExpr:
		return convertBinaryExpr(fset, e)
	case *ast.UnaryExpr:
		return convertUnaryExpr(fset, e)
	case *ast.CallExpr:
		return convertCallExpr(fset, e)
	case *ast.SelectorExpr:
		return convertSelectorExpr(fset, e)
	case *ast.IndexExpr:
		return convertIndexExpr(fset, e)
	case *ast.IndexListExpr:
		return convertIndexListExpr(fset, e)
	case *ast.SliceExpr:
		return convertSliceExpr(fset, e)
	case *ast.TypeAssertExpr:
		return convertTypeAssertExpr(fset, e)
	case *ast.StarExpr:
		return convertStarExpr(fset, e)
	case *ast.ParenExpr:
		return convertParenExpr(fset, e)
	case *ast.KeyValueExpr:
		return convertKeyValueExpr(fset, e)
	case *ast.Ellipsis:
		return convertEllipsis(fset, e)
	case *ast.ArrayType:
		return convertArrayType(fset, e)
	case *ast.MapType:
		return convertMapType(fset, e)
	case *ast.ChanType:
		return convertChanType(fset, e)
	case *ast.StructType:
		return convertStructType(fset, e)
	case *ast.InterfaceType:
		return convertInterfaceType(fset, e)
	case *ast.FuncType:
		return convertFuncType(fset, e)
	case *ast.BadExpr:
		return Node{"Kind": "BadExpr", "Pos": posInfo(fset, e.Pos())}
	default:
		return Node{"Kind": "UnknownExpr", "Pos": posInfo(fset, expr.Pos())}
	}
}

func convertIdent(fset *token.FileSet, id *ast.Ident) Node {
	if id == nil {
		return nil
	}
	return Node{
		"Kind": "Ident",
		"Name": id.Name,
		"Pos":  posInfo(fset, id.Pos()),
	}
}

func convertBasicLit(fset *token.FileSet, lit *ast.BasicLit) Node {
	if lit == nil {
		return nil
	}
	return Node{
		"Kind":  "BasicLit",
		"Token": lit.Kind.String(),
		"Value": lit.Value,
		"Pos":   posInfo(fset, lit.Pos()),
	}
}

func convertCompositeLit(fset *token.FileSet, cl *ast.CompositeLit) Node {
	node := Node{
		"Kind":       "CompositeLit",
		"Pos":        posInfo(fset, cl.Pos()),
		"Incomplete": cl.Incomplete,
	}
	if cl.Type != nil {
		node["Type"] = convertExpr(fset, cl.Type)
	}
	elts := []interface{}{}
	for _, elt := range cl.Elts {
		elts = append(elts, convertExpr(fset, elt))
	}
	node["Elts"] = elts
	return node
}

func convertFuncLit(fset *token.FileSet, fl *ast.FuncLit) Node {
	node := Node{
		"Kind": "FuncLit",
		"Pos":  posInfo(fset, fl.Pos()),
	}
	if fl.Type != nil {
		node["Type"] = convertFuncType(fset, fl.Type)
	}
	if fl.Body != nil {
		node["Body"] = convertBlockStmt(fset, fl.Body)
	}
	return node
}

func convertBinaryExpr(fset *token.FileSet, be *ast.BinaryExpr) Node {
	return Node{
		"Kind": "BinaryExpr",
		"Op":   be.Op.String(),
		"X":    convertExpr(fset, be.X),
		"Y":    convertExpr(fset, be.Y),
		"Pos":  posInfo(fset, be.Pos()),
	}
}

func convertUnaryExpr(fset *token.FileSet, ue *ast.UnaryExpr) Node {
	return Node{
		"Kind": "UnaryExpr",
		"Op":   ue.Op.String(),
		"X":    convertExpr(fset, ue.X),
		"Pos":  posInfo(fset, ue.Pos()),
	}
}

func convertCallExpr(fset *token.FileSet, ce *ast.CallExpr) Node {
	node := Node{
		"Kind":     "CallExpr",
		"Fun":      convertExpr(fset, ce.Fun),
		"Ellipsis": ce.Ellipsis.IsValid(),
		"Pos":      posInfo(fset, ce.Pos()),
	}
	args := []interface{}{}
	for _, arg := range ce.Args {
		args = append(args, convertExpr(fset, arg))
	}
	node["Args"] = args
	return node
}

func convertSelectorExpr(fset *token.FileSet, se *ast.SelectorExpr) Node {
	return Node{
		"Kind": "SelectorExpr",
		"X":    convertExpr(fset, se.X),
		"Sel":  convertIdent(fset, se.Sel),
		"Pos":  posInfo(fset, se.Pos()),
	}
}

func convertIndexExpr(fset *token.FileSet, ie *ast.IndexExpr) Node {
	return Node{
		"Kind":  "IndexExpr",
		"X":     convertExpr(fset, ie.X),
		"Index": convertExpr(fset, ie.Index),
		"Pos":   posInfo(fset, ie.Pos()),
	}
}

func convertIndexListExpr(fset *token.FileSet, ile *ast.IndexListExpr) Node {
	indices := []interface{}{}
	for _, idx := range ile.Indices {
		indices = append(indices, convertExpr(fset, idx))
	}
	return Node{
		"Kind":    "IndexListExpr",
		"X":       convertExpr(fset, ile.X),
		"Indices": indices,
		"Pos":     posInfo(fset, ile.Pos()),
	}
}

func convertSliceExpr(fset *token.FileSet, se *ast.SliceExpr) Node {
	node := Node{
		"Kind":   "SliceExpr",
		"X":      convertExpr(fset, se.X),
		"Slice3": se.Slice3,
		"Pos":    posInfo(fset, se.Pos()),
	}
	if se.Low != nil {
		node["Low"] = convertExpr(fset, se.Low)
	}
	if se.High != nil {
		node["High"] = convertExpr(fset, se.High)
	}
	if se.Max != nil {
		node["Max"] = convertExpr(fset, se.Max)
	}
	return node
}

func convertTypeAssertExpr(fset *token.FileSet, ta *ast.TypeAssertExpr) Node {
	node := Node{
		"Kind": "TypeAssertExpr",
		"X":    convertExpr(fset, ta.X),
		"Pos":  posInfo(fset, ta.Pos()),
	}
	if ta.Type != nil {
		node["Type"] = convertExpr(fset, ta.Type)
	} else {
		// type switch: x.(type)
		node["Type"] = nil
	}
	return node
}

func convertStarExpr(fset *token.FileSet, se *ast.StarExpr) Node {
	return Node{
		"Kind": "StarExpr",
		"X":    convertExpr(fset, se.X),
		"Pos":  posInfo(fset, se.Pos()),
	}
}

func convertParenExpr(fset *token.FileSet, pe *ast.ParenExpr) Node {
	return Node{
		"Kind": "ParenExpr",
		"X":    convertExpr(fset, pe.X),
		"Pos":  posInfo(fset, pe.Pos()),
	}
}

func convertKeyValueExpr(fset *token.FileSet, kv *ast.KeyValueExpr) Node {
	return Node{
		"Kind":  "KeyValueExpr",
		"Key":   convertExpr(fset, kv.Key),
		"Value": convertExpr(fset, kv.Value),
		"Pos":   posInfo(fset, kv.Pos()),
	}
}

func convertEllipsis(fset *token.FileSet, e *ast.Ellipsis) Node {
	node := Node{
		"Kind": "Ellipsis",
		"Pos":  posInfo(fset, e.Pos()),
	}
	if e.Elt != nil {
		node["Elt"] = convertExpr(fset, e.Elt)
	}
	return node
}

// --- Type expressions ---

func convertArrayType(fset *token.FileSet, at *ast.ArrayType) Node {
	node := Node{
		"Kind": "ArrayType",
		"Elt":  convertExpr(fset, at.Elt),
		"Pos":  posInfo(fset, at.Pos()),
	}
	if at.Len != nil {
		node["Len"] = convertExpr(fset, at.Len)
	}
	return node
}

func convertMapType(fset *token.FileSet, mt *ast.MapType) Node {
	return Node{
		"Kind":  "MapType",
		"Key":   convertExpr(fset, mt.Key),
		"Value": convertExpr(fset, mt.Value),
		"Pos":   posInfo(fset, mt.Pos()),
	}
}

func convertChanType(fset *token.FileSet, ct *ast.ChanType) Node {
	dir := "both"
	if ct.Dir == ast.SEND {
		dir = "send"
	} else if ct.Dir == ast.RECV {
		dir = "recv"
	}
	return Node{
		"Kind":  "ChanType",
		"Dir":   dir,
		"Value": convertExpr(fset, ct.Value),
		"Pos":   posInfo(fset, ct.Pos()),
	}
}

func convertStructType(fset *token.FileSet, st *ast.StructType) Node {
	node := Node{
		"Kind":       "StructType",
		"Incomplete": st.Incomplete,
		"Pos":        posInfo(fset, st.Pos()),
	}
	if st.Fields != nil {
		node["Fields"] = convertFieldList(fset, st.Fields)
	}
	return node
}

func convertInterfaceType(fset *token.FileSet, it *ast.InterfaceType) Node {
	node := Node{
		"Kind":       "InterfaceType",
		"Incomplete": it.Incomplete,
		"Pos":        posInfo(fset, it.Pos()),
	}
	if it.Methods != nil {
		node["Methods"] = convertFieldList(fset, it.Methods)
	}
	return node
}

func convertFuncType(fset *token.FileSet, ft *ast.FuncType) Node {
	if ft == nil {
		return nil
	}
	node := Node{
		"Kind": "FuncType",
		"Pos":  posInfo(fset, ft.Pos()),
	}
	if ft.TypeParams != nil {
		node["TypeParams"] = convertFieldList(fset, ft.TypeParams)
	}
	if ft.Params != nil {
		node["Params"] = convertFieldList(fset, ft.Params)
	}
	if ft.Results != nil {
		node["Results"] = convertFieldList(fset, ft.Results)
	}
	return node
}

func convertFieldList(fset *token.FileSet, fl *ast.FieldList) Node {
	if fl == nil {
		return nil
	}
	fields := []interface{}{}
	for _, f := range fl.List {
		fields = append(fields, convertField(fset, f))
	}
	return Node{
		"Kind":   "FieldList",
		"Fields": fields,
	}
}

func convertField(fset *token.FileSet, f *ast.Field) Node {
	node := Node{
		"Kind": "Field",
		"Pos":  posInfo(fset, f.Pos()),
	}

	if f.Doc != nil {
		node["Doc"] = convertCommentGroup(fset, f.Doc)
	}
	if f.Comment != nil {
		node["Comment"] = convertCommentGroup(fset, f.Comment)
	}

	names := []interface{}{}
	for _, name := range f.Names {
		names = append(names, name.Name)
	}
	if len(names) > 0 {
		node["Names"] = names
	}

	if f.Type != nil {
		node["Type"] = convertExpr(fset, f.Type)
	}

	if f.Tag != nil {
		node["Tag"] = f.Tag.Value
	}

	return node
}

// --- Statements ---

func convertStmt(fset *token.FileSet, stmt ast.Stmt) interface{} {
	if stmt == nil {
		return nil
	}
	switch s := stmt.(type) {
	case *ast.BlockStmt:
		return convertBlockStmt(fset, s)
	case *ast.ExprStmt:
		return convertExprStmt(fset, s)
	case *ast.AssignStmt:
		return convertAssignStmt(fset, s)
	case *ast.DeclStmt:
		return convertDeclStmt(fset, s)
	case *ast.ReturnStmt:
		return convertReturnStmt(fset, s)
	case *ast.IfStmt:
		return convertIfStmt(fset, s)
	case *ast.ForStmt:
		return convertForStmt(fset, s)
	case *ast.RangeStmt:
		return convertRangeStmt(fset, s)
	case *ast.SwitchStmt:
		return convertSwitchStmt(fset, s)
	case *ast.TypeSwitchStmt:
		return convertTypeSwitchStmt(fset, s)
	case *ast.SelectStmt:
		return convertSelectStmt(fset, s)
	case *ast.CaseClause:
		return convertCaseClause(fset, s)
	case *ast.CommClause:
		return convertCommClause(fset, s)
	case *ast.GoStmt:
		return convertGoStmt(fset, s)
	case *ast.DeferStmt:
		return convertDeferStmt(fset, s)
	case *ast.SendStmt:
		return convertSendStmt(fset, s)
	case *ast.IncDecStmt:
		return convertIncDecStmt(fset, s)
	case *ast.BranchStmt:
		return convertBranchStmt(fset, s)
	case *ast.LabeledStmt:
		return convertLabeledStmt(fset, s)
	case *ast.EmptyStmt:
		return Node{
			"Kind":     "EmptyStmt",
			"Implicit": s.Implicit,
			"Pos":      posInfo(fset, s.Pos()),
		}
	case *ast.BadStmt:
		return Node{"Kind": "BadStmt", "Pos": posInfo(fset, s.Pos())}
	default:
		return Node{"Kind": "UnknownStmt", "Pos": posInfo(fset, stmt.Pos())}
	}
}

func convertBlockStmt(fset *token.FileSet, bs *ast.BlockStmt) Node {
	if bs == nil {
		return nil
	}
	stmts := []interface{}{}
	for _, s := range bs.List {
		stmts = append(stmts, convertStmt(fset, s))
	}
	return Node{
		"Kind":  "BlockStmt",
		"Stmts": stmts,
		"Pos":   posInfo(fset, bs.Pos()),
	}
}

func convertExprStmt(fset *token.FileSet, es *ast.ExprStmt) Node {
	return Node{
		"Kind": "ExprStmt",
		"X":    convertExpr(fset, es.X),
		"Pos":  posInfo(fset, es.Pos()),
	}
}

func convertAssignStmt(fset *token.FileSet, as *ast.AssignStmt) Node {
	lhs := []interface{}{}
	for _, l := range as.Lhs {
		lhs = append(lhs, convertExpr(fset, l))
	}
	rhs := []interface{}{}
	for _, r := range as.Rhs {
		rhs = append(rhs, convertExpr(fset, r))
	}
	return Node{
		"Kind":  "AssignStmt",
		"Token": as.Tok.String(),
		"Lhs":   lhs,
		"Rhs":   rhs,
		"Pos":   posInfo(fset, as.Pos()),
	}
}

func convertDeclStmt(fset *token.FileSet, ds *ast.DeclStmt) Node {
	return Node{
		"Kind": "DeclStmt",
		"Decl": convertDecl(fset, ds.Decl),
		"Pos":  posInfo(fset, ds.Pos()),
	}
}

func convertReturnStmt(fset *token.FileSet, rs *ast.ReturnStmt) Node {
	results := []interface{}{}
	for _, r := range rs.Results {
		results = append(results, convertExpr(fset, r))
	}
	return Node{
		"Kind":    "ReturnStmt",
		"Results": results,
		"Pos":     posInfo(fset, rs.Pos()),
	}
}

func convertIfStmt(fset *token.FileSet, is *ast.IfStmt) Node {
	node := Node{
		"Kind": "IfStmt",
		"Pos":  posInfo(fset, is.Pos()),
	}
	if is.Init != nil {
		node["Init"] = convertStmt(fset, is.Init)
	}
	if is.Cond != nil {
		node["Cond"] = convertExpr(fset, is.Cond)
	}
	if is.Body != nil {
		node["Body"] = convertBlockStmt(fset, is.Body)
	}
	if is.Else != nil {
		node["Else"] = convertStmt(fset, is.Else)
	}
	return node
}

func convertForStmt(fset *token.FileSet, fs *ast.ForStmt) Node {
	node := Node{
		"Kind": "ForStmt",
		"Pos":  posInfo(fset, fs.Pos()),
	}
	if fs.Init != nil {
		node["Init"] = convertStmt(fset, fs.Init)
	}
	if fs.Cond != nil {
		node["Cond"] = convertExpr(fset, fs.Cond)
	}
	if fs.Post != nil {
		node["Post"] = convertStmt(fset, fs.Post)
	}
	if fs.Body != nil {
		node["Body"] = convertBlockStmt(fset, fs.Body)
	}
	return node
}

func convertRangeStmt(fset *token.FileSet, rs *ast.RangeStmt) Node {
	node := Node{
		"Kind":  "RangeStmt",
		"Token": rs.Tok.String(),
		"Pos":   posInfo(fset, rs.Pos()),
	}
	if rs.Key != nil {
		node["Key"] = convertExpr(fset, rs.Key)
	}
	if rs.Value != nil {
		node["Value"] = convertExpr(fset, rs.Value)
	}
	if rs.X != nil {
		node["X"] = convertExpr(fset, rs.X)
	}
	if rs.Body != nil {
		node["Body"] = convertBlockStmt(fset, rs.Body)
	}
	return node
}

func convertSwitchStmt(fset *token.FileSet, ss *ast.SwitchStmt) Node {
	node := Node{
		"Kind": "SwitchStmt",
		"Pos":  posInfo(fset, ss.Pos()),
	}
	if ss.Init != nil {
		node["Init"] = convertStmt(fset, ss.Init)
	}
	if ss.Tag != nil {
		node["Tag"] = convertExpr(fset, ss.Tag)
	}
	if ss.Body != nil {
		node["Body"] = convertBlockStmt(fset, ss.Body)
	}
	return node
}

func convertTypeSwitchStmt(fset *token.FileSet, ts *ast.TypeSwitchStmt) Node {
	node := Node{
		"Kind": "TypeSwitchStmt",
		"Pos":  posInfo(fset, ts.Pos()),
	}
	if ts.Init != nil {
		node["Init"] = convertStmt(fset, ts.Init)
	}
	if ts.Assign != nil {
		node["Assign"] = convertStmt(fset, ts.Assign)
	}
	if ts.Body != nil {
		node["Body"] = convertBlockStmt(fset, ts.Body)
	}
	return node
}

func convertSelectStmt(fset *token.FileSet, ss *ast.SelectStmt) Node {
	node := Node{
		"Kind": "SelectStmt",
		"Pos":  posInfo(fset, ss.Pos()),
	}
	if ss.Body != nil {
		node["Body"] = convertBlockStmt(fset, ss.Body)
	}
	return node
}

func convertCaseClause(fset *token.FileSet, cc *ast.CaseClause) Node {
	list := []interface{}{}
	for _, l := range cc.List {
		list = append(list, convertExpr(fset, l))
	}
	body := []interface{}{}
	for _, b := range cc.Body {
		body = append(body, convertStmt(fset, b))
	}
	return Node{
		"Kind": "CaseClause",
		"List": list,
		"Body": body,
		"Pos":  posInfo(fset, cc.Pos()),
	}
}

func convertCommClause(fset *token.FileSet, cc *ast.CommClause) Node {
	node := Node{
		"Kind": "CommClause",
		"Pos":  posInfo(fset, cc.Pos()),
	}
	if cc.Comm != nil {
		node["Comm"] = convertStmt(fset, cc.Comm)
	}
	body := []interface{}{}
	for _, b := range cc.Body {
		body = append(body, convertStmt(fset, b))
	}
	node["Body"] = body
	return node
}

func convertGoStmt(fset *token.FileSet, gs *ast.GoStmt) Node {
	return Node{
		"Kind": "GoStmt",
		"Call": convertCallExpr(fset, gs.Call),
		"Pos":  posInfo(fset, gs.Pos()),
	}
}

func convertDeferStmt(fset *token.FileSet, ds *ast.DeferStmt) Node {
	return Node{
		"Kind": "DeferStmt",
		"Call": convertCallExpr(fset, ds.Call),
		"Pos":  posInfo(fset, ds.Pos()),
	}
}

func convertSendStmt(fset *token.FileSet, ss *ast.SendStmt) Node {
	return Node{
		"Kind":  "SendStmt",
		"Chan":  convertExpr(fset, ss.Chan),
		"Value": convertExpr(fset, ss.Value),
		"Pos":   posInfo(fset, ss.Pos()),
	}
}

func convertIncDecStmt(fset *token.FileSet, ids *ast.IncDecStmt) Node {
	return Node{
		"Kind":  "IncDecStmt",
		"X":     convertExpr(fset, ids.X),
		"Token": ids.Tok.String(),
		"Pos":   posInfo(fset, ids.Pos()),
	}
}

func convertBranchStmt(fset *token.FileSet, bs *ast.BranchStmt) Node {
	node := Node{
		"Kind":  "BranchStmt",
		"Token": bs.Tok.String(),
		"Pos":   posInfo(fset, bs.Pos()),
	}
	if bs.Label != nil {
		node["Label"] = bs.Label.Name
	}
	return node
}

func convertLabeledStmt(fset *token.FileSet, ls *ast.LabeledStmt) Node {
	node := Node{
		"Kind":  "LabeledStmt",
		"Label": ls.Label.Name,
		"Pos":   posInfo(fset, ls.Pos()),
	}
	if ls.Stmt != nil {
		node["Stmt"] = convertStmt(fset, ls.Stmt)
	}
	return node
}
