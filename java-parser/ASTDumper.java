import com.sun.source.tree.*;
import com.sun.source.util.JavacTask;
import com.sun.source.util.TreeScanner;

import javax.tools.*;
import java.io.*;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.stream.Collectors;

/**
 * ASTDumper - Parses Java source files and outputs JSON AST to stdout.
 *
 * Uses the JDK's com.sun.source.tree API (no external dependencies).
 * Compile: javac ASTDumper.java
 * Run:     java ASTDumper <source-file.java>
 */
public class ASTDumper {

    public static void main(String[] args) throws Exception {
        if (args.length < 1) {
            System.err.println("Usage: java ASTDumper <java-source-file>");
            System.exit(1);
        }

        String filePath = args[0];
        Path path = Path.of(filePath);
        if (!Files.exists(path)) {
            System.err.println("Error: File not found: " + filePath);
            System.exit(1);
        }

        String source = Files.readString(path);

        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        if (compiler == null) {
            System.err.println("Error: No Java compiler available. Run with a JDK, not a JRE.");
            System.exit(1);
        }

        DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
        JavaFileObject fileObject = new SimpleJavaFileObject(
                URI.create("string:///" + path.getFileName().toString()), JavaFileObject.Kind.SOURCE) {
            @Override
            public CharSequence getCharContent(boolean ignoreEncodingErrors) {
                return source;
            }
        };

        JavacTask task = (JavacTask) compiler.getTask(
                null, null, diagnostics, List.of(), null, List.of(fileObject));

        Iterable<? extends CompilationUnitTree> units;
        try {
            units = task.parse();
        } catch (Exception e) {
            System.err.println("Error: Failed to parse file: " + e.getMessage());
            System.exit(1);
            return;
        }

        // Report parse errors to stderr but still produce output
        for (Diagnostic<? extends JavaFileObject> diag : diagnostics.getDiagnostics()) {
            if (diag.getKind() == Diagnostic.Kind.ERROR) {
                System.err.println("Parse error: " + diag.getMessage(null));
            }
        }

        ASTVisitor visitor = new ASTVisitor();
        for (CompilationUnitTree cu : units) {
            Map<String, Object> ast = visitor.visitCompilationUnit(cu, null);
            String json = JsonWriter.toJson(ast, 0);
            System.out.println(json);
        }
    }

    // -----------------------------------------------------------------------
    // AST Visitor - converts each tree node to a Map<String,Object>
    // -----------------------------------------------------------------------
    static class ASTVisitor extends TreeScanner<Map<String, Object>, Void> {

        // Helper: create a node map with a Kind field
        private Map<String, Object> node(String kind) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("Kind", kind);
            return m;
        }

        // Helper: visit a tree and return its map (null-safe)
        private Map<String, Object> visit(Tree tree) {
            if (tree == null) return null;
            return scan(tree, null);
        }

        // Helper: visit a list of trees
        private List<Map<String, Object>> visitList(List<? extends Tree> trees) {
            if (trees == null || trees.isEmpty()) return List.of();
            List<Map<String, Object>> result = new ArrayList<>();
            for (Tree t : trees) {
                Map<String, Object> m = visit(t);
                if (m != null) result.add(m);
            }
            return result;
        }

        // Helper: modifiers to list of strings
        private List<String> modifierStrings(ModifiersTree mods) {
            if (mods == null) return List.of();
            List<String> result = new ArrayList<>();
            for (javax.lang.model.element.Modifier m : mods.getFlags()) {
                result.add(m.toString());
            }
            return result;
        }

        // Helper: annotations from modifiers
        private List<Map<String, Object>> annotationsFromMods(ModifiersTree mods) {
            if (mods == null || mods.getAnnotations() == null) return List.of();
            return visitList(mods.getAnnotations());
        }

        // Helper: convert a Name or Tree to a string, null-safe
        private String nameStr(Object nameOrTree) {
            if (nameOrTree == null) return null;
            String s = nameOrTree.toString();
            return s.isEmpty() ? null : s;
        }

        // --- Compilation Unit ---
        @Override
        public Map<String, Object> visitCompilationUnit(CompilationUnitTree cu, Void p) {
            Map<String, Object> n = node("CompilationUnit");
            if (cu.getPackage() != null) {
                n.put("Package", visit(cu.getPackage()));
            }
            List<Map<String, Object>> imports = visitList(cu.getImports());
            if (!imports.isEmpty()) n.put("Imports", imports);
            List<Map<String, Object>> decls = visitList(cu.getTypeDecls());
            if (!decls.isEmpty()) n.put("Decls", decls);
            return n;
        }

        // --- Package ---
        @Override
        public Map<String, Object> visitPackage(PackageTree pt, Void p) {
            Map<String, Object> n = node("PackageDecl");
            n.put("Name", pt.getPackageName().toString());
            List<Map<String, Object>> annots = visitList(pt.getAnnotations());
            if (!annots.isEmpty()) n.put("Annotations", annots);
            return n;
        }

        // --- Import ---
        @Override
        public Map<String, Object> visitImport(ImportTree it, Void p) {
            Map<String, Object> n = node("ImportDecl");
            n.put("Path", it.getQualifiedIdentifier().toString());
            if (it.isStatic()) n.put("Static", true);
            return n;
        }

        // --- Class / Interface / Enum / Record ---
        @Override
        public Map<String, Object> visitClass(ClassTree ct, Void p) {
            Map<String, Object> n;
            // Determine kind based on modifiers or tree kind
            Tree.Kind treeKind = ct.getKind();
            switch (treeKind) {
                case INTERFACE -> n = node("InterfaceDecl");
                case ENUM -> n = node("EnumDecl");
                case RECORD -> n = node("RecordDecl");
                case ANNOTATION_TYPE -> n = node("AnnotationTypeDecl");
                default -> n = node("ClassDecl");
            }

            String name = nameStr(ct.getSimpleName());
            if (name != null) n.put("Name", name);

            List<String> mods = modifierStrings(ct.getModifiers());
            if (!mods.isEmpty()) n.put("Modifiers", mods);

            List<Map<String, Object>> annots = annotationsFromMods(ct.getModifiers());
            if (!annots.isEmpty()) n.put("Annotations", annots);

            // Type parameters (generics)
            if (ct.getTypeParameters() != null && !ct.getTypeParameters().isEmpty()) {
                n.put("TypeParams", visitList(ct.getTypeParameters()));
            }

            // Extends
            if (ct.getExtendsClause() != null) {
                n.put("Extends", visit(ct.getExtendsClause()));
            }

            // Implements
            if (ct.getImplementsClause() != null && !ct.getImplementsClause().isEmpty()) {
                n.put("Implements", visitList(ct.getImplementsClause()));
            }

            // Permits (sealed classes)
            if (ct.getPermitsClause() != null && !ct.getPermitsClause().isEmpty()) {
                n.put("Permits", visitList(ct.getPermitsClause()));
            }

            // Members (body)
            List<Map<String, Object>> members = visitList(ct.getMembers());
            if (!members.isEmpty()) n.put("Body", members);

            return n;
        }

        // --- Method ---
        @Override
        public Map<String, Object> visitMethod(MethodTree mt, Void p) {
            String name = mt.getName().toString();
            boolean isConstructor = name.equals("<init>");

            Map<String, Object> n = node(isConstructor ? "ConstructorDecl" : "MethodDecl");
            if (!isConstructor) {
                n.put("Name", name);
            }

            List<String> mods = modifierStrings(mt.getModifiers());
            if (!mods.isEmpty()) n.put("Modifiers", mods);

            List<Map<String, Object>> annots = annotationsFromMods(mt.getModifiers());
            if (!annots.isEmpty()) n.put("Annotations", annots);

            // Type parameters
            if (mt.getTypeParameters() != null && !mt.getTypeParameters().isEmpty()) {
                n.put("TypeParams", visitList(mt.getTypeParameters()));
            }

            // Return type (not for constructors)
            if (!isConstructor && mt.getReturnType() != null) {
                n.put("ReturnType", visit(mt.getReturnType()));
            }

            // Parameters
            if (mt.getParameters() != null && !mt.getParameters().isEmpty()) {
                n.put("Params", visitList(mt.getParameters()));
            }

            // Throws
            if (mt.getThrows() != null && !mt.getThrows().isEmpty()) {
                n.put("Throws", visitList(mt.getThrows()));
            }

            // Default value (annotation methods)
            if (mt.getDefaultValue() != null) {
                n.put("Default", visit(mt.getDefaultValue()));
            }

            // Body
            if (mt.getBody() != null) {
                n.put("Body", visit(mt.getBody()));
            }

            return n;
        }

        // --- Variable (field, local, parameter) ---
        @Override
        public Map<String, Object> visitVariable(VariableTree vt, Void p) {
            Map<String, Object> n = node("VarDecl");
            n.put("Name", vt.getName().toString());

            List<String> mods = modifierStrings(vt.getModifiers());
            if (!mods.isEmpty()) n.put("Modifiers", mods);

            List<Map<String, Object>> annots = annotationsFromMods(vt.getModifiers());
            if (!annots.isEmpty()) n.put("Annotations", annots);

            if (vt.getType() != null) {
                n.put("Type", visit(vt.getType()));
            }

            if (vt.getInitializer() != null) {
                n.put("Init", visit(vt.getInitializer()));
            }

            return n;
        }

        // --- Type Parameter ---
        @Override
        public Map<String, Object> visitTypeParameter(TypeParameterTree tp, Void p) {
            Map<String, Object> n = node("TypeParam");
            n.put("Name", tp.getName().toString());
            if (tp.getBounds() != null && !tp.getBounds().isEmpty()) {
                n.put("Bounds", visitList(tp.getBounds()));
            }
            List<Map<String, Object>> annots = visitList(tp.getAnnotations());
            if (!annots.isEmpty()) n.put("Annotations", annots);
            return n;
        }

        // ===================================================================
        // STATEMENTS
        // ===================================================================

        @Override
        public Map<String, Object> visitBlock(BlockTree bt, Void p) {
            Map<String, Object> n = node("BlockStmt");
            if (bt.isStatic()) n.put("Static", true);
            List<Map<String, Object>> stmts = visitList(bt.getStatements());
            if (!stmts.isEmpty()) n.put("Stmts", stmts);
            return n;
        }

        @Override
        public Map<String, Object> visitReturn(ReturnTree rt, Void p) {
            Map<String, Object> n = node("ReturnStmt");
            if (rt.getExpression() != null) {
                n.put("Value", visit(rt.getExpression()));
            }
            return n;
        }

        @Override
        public Map<String, Object> visitIf(IfTree it, Void p) {
            Map<String, Object> n = node("IfStmt");
            n.put("Cond", visit(it.getCondition()));
            n.put("Then", visit(it.getThenStatement()));
            if (it.getElseStatement() != null) {
                n.put("Else", visit(it.getElseStatement()));
            }
            return n;
        }

        @Override
        public Map<String, Object> visitForLoop(ForLoopTree ft, Void p) {
            Map<String, Object> n = node("ForStmt");
            List<Map<String, Object>> init = visitList(ft.getInitializer());
            if (!init.isEmpty()) n.put("Init", init);
            if (ft.getCondition() != null) n.put("Cond", visit(ft.getCondition()));
            List<Map<String, Object>> update = visitList(ft.getUpdate());
            if (!update.isEmpty()) n.put("Update", update);
            n.put("Body", visit(ft.getStatement()));
            return n;
        }

        @Override
        public Map<String, Object> visitEnhancedForLoop(EnhancedForLoopTree eft, Void p) {
            Map<String, Object> n = node("ForEachStmt");
            n.put("Var", visit(eft.getVariable()));
            n.put("Expr", visit(eft.getExpression()));
            n.put("Body", visit(eft.getStatement()));
            return n;
        }

        @Override
        public Map<String, Object> visitWhileLoop(WhileLoopTree wt, Void p) {
            Map<String, Object> n = node("WhileStmt");
            n.put("Cond", visit(wt.getCondition()));
            n.put("Body", visit(wt.getStatement()));
            return n;
        }

        @Override
        public Map<String, Object> visitDoWhileLoop(DoWhileLoopTree dwt, Void p) {
            Map<String, Object> n = node("DoWhileStmt");
            n.put("Cond", visit(dwt.getCondition()));
            n.put("Body", visit(dwt.getStatement()));
            return n;
        }

        @Override
        public Map<String, Object> visitSwitch(SwitchTree st, Void p) {
            Map<String, Object> n = node("SwitchStmt");
            n.put("Expr", visit(st.getExpression()));
            List<Map<String, Object>> cases = visitList(st.getCases());
            if (!cases.isEmpty()) n.put("Cases", cases);
            return n;
        }

        @Override
        public Map<String, Object> visitSwitchExpression(SwitchExpressionTree set, Void p) {
            Map<String, Object> n = node("SwitchExpr");
            n.put("Expr", visit(set.getExpression()));
            List<Map<String, Object>> cases = visitList(set.getCases());
            if (!cases.isEmpty()) n.put("Cases", cases);
            return n;
        }

        @Override
        public Map<String, Object> visitCase(CaseTree ct, Void p) {
            Map<String, Object> n = node("CaseClause");
            // getExpressions() gives case labels; empty means "default"
            List<? extends CaseLabelTree> labels = ct.getLabels();
            if (labels != null && !labels.isEmpty()) {
                // Check if it's a default case
                boolean isDefault = labels.stream().anyMatch(l -> l instanceof DefaultCaseLabelTree);
                if (isDefault) {
                    n.put("Default", true);
                } else {
                    n.put("Labels", visitList(labels));
                }
            }
            // Body can be statements or a body (arrow-style)
            if (ct.getBody() != null) {
                n.put("Body", visit(ct.getBody()));
            }
            List<Map<String, Object>> stmts = visitList(ct.getStatements());
            if (stmts != null && !stmts.isEmpty()) {
                n.put("Stmts", stmts);
            }
            return n;
        }

        @Override
        public Map<String, Object> visitDefaultCaseLabel(DefaultCaseLabelTree dt, Void p) {
            return node("DefaultLabel");
        }

        @Override
        public Map<String, Object> visitTry(TryTree tt, Void p) {
            Map<String, Object> n = node("TryStmt");

            // Try-with-resources
            if (tt.getResources() != null && !tt.getResources().isEmpty()) {
                n.put("Resources", visitList(tt.getResources()));
            }

            n.put("Body", visit(tt.getBlock()));

            List<Map<String, Object>> catches = visitList(tt.getCatches());
            if (!catches.isEmpty()) n.put("Catches", catches);

            if (tt.getFinallyBlock() != null) {
                n.put("Finally", visit(tt.getFinallyBlock()));
            }
            return n;
        }

        @Override
        public Map<String, Object> visitCatch(CatchTree ct, Void p) {
            Map<String, Object> n = node("CatchClause");
            n.put("Param", visit(ct.getParameter()));
            n.put("Body", visit(ct.getBlock()));
            return n;
        }

        @Override
        public Map<String, Object> visitThrow(ThrowTree tt, Void p) {
            Map<String, Object> n = node("ThrowStmt");
            n.put("Expr", visit(tt.getExpression()));
            return n;
        }

        @Override
        public Map<String, Object> visitBreak(BreakTree bt, Void p) {
            Map<String, Object> n = node("BreakStmt");
            if (bt.getLabel() != null) {
                n.put("Label", bt.getLabel().toString());
            }
            return n;
        }

        @Override
        public Map<String, Object> visitContinue(ContinueTree ct, Void p) {
            Map<String, Object> n = node("ContinueStmt");
            if (ct.getLabel() != null) {
                n.put("Label", ct.getLabel().toString());
            }
            return n;
        }

        @Override
        public Map<String, Object> visitLabeledStatement(LabeledStatementTree lst, Void p) {
            Map<String, Object> n = node("LabeledStmt");
            n.put("Label", lst.getLabel().toString());
            n.put("Stmt", visit(lst.getStatement()));
            return n;
        }

        @Override
        public Map<String, Object> visitExpressionStatement(ExpressionStatementTree est, Void p) {
            Map<String, Object> n = node("ExprStmt");
            n.put("Expr", visit(est.getExpression()));
            return n;
        }

        @Override
        public Map<String, Object> visitAssert(AssertTree at, Void p) {
            Map<String, Object> n = node("AssertStmt");
            n.put("Cond", visit(at.getCondition()));
            if (at.getDetail() != null) {
                n.put("Detail", visit(at.getDetail()));
            }
            return n;
        }

        @Override
        public Map<String, Object> visitSynchronized(SynchronizedTree st, Void p) {
            Map<String, Object> n = node("SynchronizedStmt");
            n.put("Expr", visit(st.getExpression()));
            n.put("Body", visit(st.getBlock()));
            return n;
        }

        @Override
        public Map<String, Object> visitYield(YieldTree yt, Void p) {
            Map<String, Object> n = node("YieldStmt");
            n.put("Value", visit(yt.getValue()));
            return n;
        }

        @Override
        public Map<String, Object> visitEmptyStatement(EmptyStatementTree est, Void p) {
            return node("EmptyStmt");
        }

        // ===================================================================
        // EXPRESSIONS
        // ===================================================================

        @Override
        public Map<String, Object> visitMethodInvocation(MethodInvocationTree mit, Void p) {
            Map<String, Object> n = node("MethodCall");
            n.put("Method", visit(mit.getMethodSelect()));
            List<Map<String, Object>> args = visitList(mit.getArguments());
            if (!args.isEmpty()) n.put("Args", args);
            if (mit.getTypeArguments() != null && !mit.getTypeArguments().isEmpty()) {
                n.put("TypeArgs", visitList(mit.getTypeArguments()));
            }
            return n;
        }

        @Override
        public Map<String, Object> visitNewClass(NewClassTree nct, Void p) {
            Map<String, Object> n = node("NewExpr");
            if (nct.getEnclosingExpression() != null) {
                n.put("Enclosing", visit(nct.getEnclosingExpression()));
            }
            n.put("Type", visit(nct.getIdentifier()));
            List<Map<String, Object>> args = visitList(nct.getArguments());
            if (!args.isEmpty()) n.put("Args", args);
            if (nct.getTypeArguments() != null && !nct.getTypeArguments().isEmpty()) {
                n.put("TypeArgs", visitList(nct.getTypeArguments()));
            }
            // Anonymous class body
            if (nct.getClassBody() != null) {
                n.put("Body", visit(nct.getClassBody()));
            }
            return n;
        }

        @Override
        public Map<String, Object> visitNewArray(NewArrayTree nat, Void p) {
            Map<String, Object> n = node("NewArrayExpr");
            if (nat.getType() != null) {
                n.put("Type", visit(nat.getType()));
            }
            if (nat.getDimensions() != null && !nat.getDimensions().isEmpty()) {
                n.put("Dimensions", visitList(nat.getDimensions()));
            }
            if (nat.getInitializers() != null && !nat.getInitializers().isEmpty()) {
                n.put("Init", visitList(nat.getInitializers()));
            }
            return n;
        }

        @Override
        public Map<String, Object> visitAssignment(AssignmentTree at, Void p) {
            Map<String, Object> n = node("AssignExpr");
            n.put("Target", visit(at.getVariable()));
            n.put("Value", visit(at.getExpression()));
            return n;
        }

        @Override
        public Map<String, Object> visitCompoundAssignment(CompoundAssignmentTree cat, Void p) {
            Map<String, Object> n = node("CompoundAssignExpr");
            n.put("Op", operatorString(cat.getKind()));
            n.put("Target", visit(cat.getVariable()));
            n.put("Value", visit(cat.getExpression()));
            return n;
        }

        @Override
        public Map<String, Object> visitBinary(BinaryTree bt, Void p) {
            Map<String, Object> n = node("BinaryExpr");
            n.put("Op", operatorString(bt.getKind()));
            n.put("X", visit(bt.getLeftOperand()));
            n.put("Y", visit(bt.getRightOperand()));
            return n;
        }

        @Override
        public Map<String, Object> visitUnary(UnaryTree ut, Void p) {
            Map<String, Object> n = node("UnaryExpr");
            n.put("Op", operatorString(ut.getKind()));
            n.put("X", visit(ut.getExpression()));
            return n;
        }

        @Override
        public Map<String, Object> visitConditionalExpression(ConditionalExpressionTree cet, Void p) {
            Map<String, Object> n = node("TernaryExpr");
            n.put("Cond", visit(cet.getCondition()));
            n.put("Then", visit(cet.getTrueExpression()));
            n.put("Else", visit(cet.getFalseExpression()));
            return n;
        }

        @Override
        public Map<String, Object> visitParenthesized(ParenthesizedTree pt, Void p) {
            Map<String, Object> n = node("ParenExpr");
            n.put("Expr", visit(pt.getExpression()));
            return n;
        }

        @Override
        public Map<String, Object> visitTypeCast(TypeCastTree tct, Void p) {
            Map<String, Object> n = node("CastExpr");
            n.put("Type", visit(tct.getType()));
            n.put("Expr", visit(tct.getExpression()));
            return n;
        }

        @Override
        public Map<String, Object> visitInstanceOf(InstanceOfTree iot, Void p) {
            Map<String, Object> n = node("InstanceOfExpr");
            n.put("Expr", visit(iot.getExpression()));
            n.put("Type", visit(iot.getType()));
            // Pattern matching instanceof (JDK 16+)
            if (iot.getPattern() != null) {
                n.put("Pattern", visit(iot.getPattern()));
            }
            return n;
        }

        @Override
        public Map<String, Object> visitMemberSelect(MemberSelectTree mst, Void p) {
            Map<String, Object> n = node("FieldAccess");
            n.put("Expr", visit(mst.getExpression()));
            n.put("Name", mst.getIdentifier().toString());
            return n;
        }

        @Override
        public Map<String, Object> visitMemberReference(MemberReferenceTree mrt, Void p) {
            Map<String, Object> n = node("MethodRef");
            n.put("Expr", visit(mrt.getQualifierExpression()));
            n.put("Name", mrt.getName().toString());
            if (mrt.getTypeArguments() != null && !mrt.getTypeArguments().isEmpty()) {
                n.put("TypeArgs", visitList(mrt.getTypeArguments()));
            }
            return n;
        }

        @Override
        public Map<String, Object> visitIdentifier(IdentifierTree it, Void p) {
            Map<String, Object> n = node("Ident");
            n.put("Name", it.getName().toString());
            return n;
        }

        @Override
        public Map<String, Object> visitLiteral(LiteralTree lt, Void p) {
            Map<String, Object> n = node("Literal");
            Object value = lt.getValue();
            if (value != null) {
                n.put("Value", value.toString());
                // Also store the type
                if (value instanceof String) n.put("Type", "String");
                else if (value instanceof Character) n.put("Type", "char");
                else if (value instanceof Boolean) n.put("Type", "boolean");
                else if (value instanceof Integer) n.put("Type", "int");
                else if (value instanceof Long) n.put("Type", "long");
                else if (value instanceof Float) n.put("Type", "float");
                else if (value instanceof Double) n.put("Type", "double");
            } else {
                n.put("Value", "null");
                n.put("Type", "null");
            }
            return n;
        }

        @Override
        public Map<String, Object> visitLambdaExpression(LambdaExpressionTree let, Void p) {
            Map<String, Object> n = node("LambdaExpr");
            if (let.getParameters() != null && !let.getParameters().isEmpty()) {
                n.put("Params", visitList(let.getParameters()));
            }
            n.put("Body", visit(let.getBody()));
            n.put("BodyKind", let.getBodyKind().toString());
            return n;
        }

        @Override
        public Map<String, Object> visitArrayAccess(ArrayAccessTree aat, Void p) {
            Map<String, Object> n = node("ArrayAccess");
            n.put("Expr", visit(aat.getExpression()));
            n.put("Index", visit(aat.getIndex()));
            return n;
        }

        @Override
        public Map<String, Object> visitArrayType(ArrayTypeTree att, Void p) {
            Map<String, Object> n = node("ArrayType");
            n.put("ElemType", visit(att.getType()));
            return n;
        }

        @Override
        public Map<String, Object> visitParameterizedType(ParameterizedTypeTree ptt, Void p) {
            Map<String, Object> n = node("ParameterizedType");
            n.put("Type", visit(ptt.getType()));
            if (ptt.getTypeArguments() != null && !ptt.getTypeArguments().isEmpty()) {
                n.put("TypeArgs", visitList(ptt.getTypeArguments()));
            }
            return n;
        }

        @Override
        public Map<String, Object> visitWildcard(WildcardTree wt, Void p) {
            Map<String, Object> n = node("Wildcard");
            String kind = switch (wt.getKind()) {
                case UNBOUNDED_WILDCARD -> "?";
                case EXTENDS_WILDCARD -> "extends";
                case SUPER_WILDCARD -> "super";
                default -> wt.getKind().toString();
            };
            n.put("BoundKind", kind);
            if (wt.getBound() != null) {
                n.put("Bound", visit(wt.getBound()));
            }
            return n;
        }

        @Override
        public Map<String, Object> visitPrimitiveType(PrimitiveTypeTree ptt, Void p) {
            Map<String, Object> n = node("PrimitiveType");
            n.put("Name", ptt.getPrimitiveTypeKind().toString().toLowerCase());
            return n;
        }

        @Override
        public Map<String, Object> visitAnnotation(AnnotationTree at, Void p) {
            Map<String, Object> n = node("Annotation");
            n.put("Name", visit(at.getAnnotationType()));
            if (at.getArguments() != null && !at.getArguments().isEmpty()) {
                n.put("Args", visitList(at.getArguments()));
            }
            return n;
        }

        @Override
        public Map<String, Object> visitAnnotatedType(AnnotatedTypeTree att, Void p) {
            Map<String, Object> n = node("AnnotatedType");
            n.put("Annotations", visitList(att.getAnnotations()));
            n.put("Type", visit(att.getUnderlyingType()));
            return n;
        }

        @Override
        public Map<String, Object> visitUnionType(UnionTypeTree utt, Void p) {
            Map<String, Object> n = node("UnionType");
            n.put("Types", visitList(utt.getTypeAlternatives()));
            return n;
        }

        @Override
        public Map<String, Object> visitIntersectionType(IntersectionTypeTree itt, Void p) {
            Map<String, Object> n = node("IntersectionType");
            n.put("Bounds", visitList(itt.getBounds()));
            return n;
        }

        // --- Patterns (JDK 16+) ---
        @Override
        public Map<String, Object> visitBindingPattern(BindingPatternTree bpt, Void p) {
            Map<String, Object> n = node("BindingPattern");
            n.put("Var", visit(bpt.getVariable()));
            return n;
        }

        @Override
        public Map<String, Object> visitPatternCaseLabel(PatternCaseLabelTree pclt, Void p) {
            Map<String, Object> n = node("PatternCaseLabel");
            n.put("Pattern", visit(pclt.getPattern()));
            return n;
        }

        @Override
        public Map<String, Object> visitConstantCaseLabel(ConstantCaseLabelTree cclt, Void p) {
            Map<String, Object> n = node("ConstantCaseLabel");
            n.put("Expr", visit(cclt.getConstantExpression()));
            return n;
        }

        @Override
        public Map<String, Object> visitDeconstructionPattern(DeconstructionPatternTree dpt, Void p) {
            Map<String, Object> n = node("DeconstructionPattern");
            n.put("Type", visit(dpt.getDeconstructor()));
            if (dpt.getNestedPatterns() != null && !dpt.getNestedPatterns().isEmpty()) {
                n.put("Patterns", visitList(dpt.getNestedPatterns()));
            }
            return n;
        }

        // --- Other / Miscellaneous ---
        @Override
        public Map<String, Object> visitErroneous(ErroneousTree et, Void p) {
            Map<String, Object> n = node("Erroneous");
            List<Map<String, Object>> children = visitList(et.getErrorTrees());
            if (!children.isEmpty()) n.put("Children", children);
            return n;
        }

        @Override
        public Map<String, Object> visitOther(Tree tree, Void p) {
            Map<String, Object> n = node("Other");
            n.put("TreeKind", tree.getKind().toString());
            n.put("Text", tree.toString());
            return n;
        }

        @Override
        public Map<String, Object> visitModifiers(ModifiersTree mt, Void p) {
            Map<String, Object> n = node("Modifiers");
            List<String> flags = modifierStrings(mt);
            if (!flags.isEmpty()) n.put("Flags", flags);
            List<Map<String, Object>> annots = visitList(mt.getAnnotations());
            if (!annots.isEmpty()) n.put("Annotations", annots);
            return n;
        }

        // --- Operator string conversion ---
        private String operatorString(Tree.Kind kind) {
            return switch (kind) {
                case PLUS -> "+";
                case MINUS -> "-";
                case MULTIPLY -> "*";
                case DIVIDE -> "/";
                case REMAINDER -> "%";
                case AND -> "&";
                case OR -> "|";
                case XOR -> "^";
                case CONDITIONAL_AND -> "&&";
                case CONDITIONAL_OR -> "||";
                case LEFT_SHIFT -> "<<";
                case RIGHT_SHIFT -> ">>";
                case UNSIGNED_RIGHT_SHIFT -> ">>>";
                case EQUAL_TO -> "==";
                case NOT_EQUAL_TO -> "!=";
                case LESS_THAN -> "<";
                case LESS_THAN_EQUAL -> "<=";
                case GREATER_THAN -> ">";
                case GREATER_THAN_EQUAL -> ">=";
                case UNARY_PLUS -> "+";
                case UNARY_MINUS -> "-";
                case LOGICAL_COMPLEMENT -> "!";
                case BITWISE_COMPLEMENT -> "~";
                case PREFIX_INCREMENT -> "++pre";
                case PREFIX_DECREMENT -> "--pre";
                case POSTFIX_INCREMENT -> "post++";
                case POSTFIX_DECREMENT -> "post--";
                case PLUS_ASSIGNMENT -> "+=";
                case MINUS_ASSIGNMENT -> "-=";
                case MULTIPLY_ASSIGNMENT -> "*=";
                case DIVIDE_ASSIGNMENT -> "/=";
                case REMAINDER_ASSIGNMENT -> "%=";
                case AND_ASSIGNMENT -> "&=";
                case OR_ASSIGNMENT -> "|=";
                case XOR_ASSIGNMENT -> "^=";
                case LEFT_SHIFT_ASSIGNMENT -> "<<=";
                case RIGHT_SHIFT_ASSIGNMENT -> ">>=";
                case UNSIGNED_RIGHT_SHIFT_ASSIGNMENT -> ">>>=";
                default -> kind.toString();
            };
        }
    }

    // -----------------------------------------------------------------------
    // JSON Writer - produces properly formatted, escaped JSON
    // -----------------------------------------------------------------------
    static class JsonWriter {
        private static final String INDENT = "  ";

        static String toJson(Object value, int depth) {
            if (value == null) return "null";

            if (value instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> map = (Map<String, Object>) value;
                return mapToJson(map, depth);
            }
            if (value instanceof List) {
                @SuppressWarnings("unchecked")
                List<Object> list = (List<Object>) value;
                return listToJson(list, depth);
            }
            if (value instanceof String) {
                return escapeString((String) value);
            }
            if (value instanceof Boolean || value instanceof Number) {
                return value.toString();
            }

            // Fallback
            return escapeString(value.toString());
        }

        private static String mapToJson(Map<String, Object> map, int depth) {
            if (map.isEmpty()) return "{}";

            StringBuilder sb = new StringBuilder();
            sb.append("{\n");
            String innerIndent = INDENT.repeat(depth + 1);
            String outerIndent = INDENT.repeat(depth);

            Iterator<Map.Entry<String, Object>> it = map.entrySet().iterator();
            while (it.hasNext()) {
                Map.Entry<String, Object> entry = it.next();
                sb.append(innerIndent);
                sb.append(escapeString(entry.getKey()));
                sb.append(": ");
                sb.append(toJson(entry.getValue(), depth + 1));
                if (it.hasNext()) sb.append(",");
                sb.append("\n");
            }

            sb.append(outerIndent);
            sb.append("}");
            return sb.toString();
        }

        private static String listToJson(List<Object> list, int depth) {
            if (list.isEmpty()) return "[]";

            // Check if all items are simple strings - render inline if short
            boolean allSimpleStrings = list.stream().allMatch(v -> v instanceof String);
            if (allSimpleStrings && list.size() <= 5) {
                String inline = list.stream()
                        .map(v -> escapeString((String) v))
                        .collect(Collectors.joining(", "));
                if (inline.length() < 80) {
                    return "[" + inline + "]";
                }
            }

            StringBuilder sb = new StringBuilder();
            sb.append("[\n");
            String innerIndent = INDENT.repeat(depth + 1);
            String outerIndent = INDENT.repeat(depth);

            for (int i = 0; i < list.size(); i++) {
                sb.append(innerIndent);
                sb.append(toJson(list.get(i), depth + 1));
                if (i < list.size() - 1) sb.append(",");
                sb.append("\n");
            }

            sb.append(outerIndent);
            sb.append("]");
            return sb.toString();
        }

        static String escapeString(String s) {
            StringBuilder sb = new StringBuilder();
            sb.append('"');
            for (int i = 0; i < s.length(); i++) {
                char c = s.charAt(i);
                switch (c) {
                    case '"' -> sb.append("\\\"");
                    case '\\' -> sb.append("\\\\");
                    case '\b' -> sb.append("\\b");
                    case '\f' -> sb.append("\\f");
                    case '\n' -> sb.append("\\n");
                    case '\r' -> sb.append("\\r");
                    case '\t' -> sb.append("\\t");
                    default -> {
                        if (c < 0x20) {
                            sb.append(String.format("\\u%04x", (int) c));
                        } else {
                            sb.append(c);
                        }
                    }
                }
            }
            sb.append('"');
            return sb.toString();
        }
    }
}
