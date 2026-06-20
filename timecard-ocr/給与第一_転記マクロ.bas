Attribute VB_Name = "Module1"
' ============================================================
' 確認シート → 給与第一「時間計算書」 転記マクロ（日付マッチ版）
' ------------------------------------------------------------
' 時間計算書のC列に入っている「日付」と、取込データの年月日を突き合わせ、
' 一致する行のH(始業)/I(終業)に書き込む。締め日が何日でも行ズレしない。
'
' 使い方:
'  1) 計算規則で 期間開始＝データ先頭の年月（例 2024年12月）、締め日＝25 に設定。
'  2) 「取込」シートに確認シート(氏名/年/月/日/午前IN/午前OUT/午後IN/午後OUT/...)を貼付。
'  3) このマクロ 確認シート取込 を実行。
'
' 仕様:
'  - 出勤(午前IN=E列)→ 始業(H列) / 退勤(午後OUT=H列)→ 終業(I列)
'  - 実行のたびにH/I入力欄を一旦クリアしてから書き直す（再実行で二重・ズレが残らない）
'  - 計算式(N〜Q列等)には一切触れない
' ============================================================

Sub 確認シート取込()
    Dim wsIn As Worksheet, wsOut As Worksheet
    On Error Resume Next
    Set wsIn = ThisWorkbook.Sheets("取込")
    Set wsOut = ThisWorkbook.Sheets("時間計算書")
    On Error GoTo 0
    If wsIn Is Nothing Then MsgBox "「取込」シートがありません。": Exit Sub
    If wsOut Is Nothing Then MsgBox "「時間計算書」シートが見つかりません。": Exit Sub

    Const COL_DATE As Long = 3    ' C列＝日付（フル日付が入っている）
    Const COL_START As Long = 8   ' H列＝始業
    Const COL_END As Long = 9     ' I列＝終業
    Const FIRST_ROW As Long = 5

    ' 時間計算書の日付列を配列に読み込む（行探索用）
    Dim lastOut As Long
    lastOut = wsOut.Cells(wsOut.Rows.Count, COL_DATE).End(xlUp).Row
    If lastOut < FIRST_ROW Then MsgBox "時間計算書に日付が見つかりません。": Exit Sub
    Dim dvals As Variant
    dvals = wsOut.Range(wsOut.Cells(FIRST_ROW, COL_DATE), wsOut.Cells(lastOut, COL_DATE)).Value

    ' H/I入力欄を一旦クリア（再実行してもズレ・二重が残らないように）
    wsOut.Range(wsOut.Cells(FIRST_ROW, COL_START), wsOut.Cells(lastOut, COL_END)).ClearContents

    Dim lastIn As Long
    lastIn = wsIn.Cells(wsIn.Rows.Count, 2).End(xlUp).Row

    Dim r As Long, cnt As Long, notFound As Long
    For r = 1 To lastIn
        Dim y As Variant, m As Variant, d As Variant
        y = wsIn.Cells(r, 2).Value
        m = wsIn.Cells(r, 3).Value
        d = wsIn.Cells(r, 4).Value
        If IsNumeric(y) And IsNumeric(m) And IsNumeric(d) And Len(d) > 0 Then
            Dim target As Double
            target = CDbl(DateSerial(CLng(y), CLng(m), CLng(d)))

            Dim i As Long, foundRow As Long
            foundRow = 0
            For i = 1 To UBound(dvals, 1)
                If IsDate(dvals(i, 1)) Then
                    If Int(CDbl(dvals(i, 1))) = target Then
                        foundRow = FIRST_ROW + i - 1
                        Exit For
                    End If
                End If
            Next i

            If foundRow > 0 Then
                Dim tIn As Variant, tOut As Variant
                tIn = ToTime(wsIn.Cells(r, 5).Value)   ' E＝午前IN(出勤)
                tOut = ToTime(wsIn.Cells(r, 8).Value)  ' H＝午後OUT(退勤)
                If tIn <> "" Then wsOut.Cells(foundRow, COL_START).Value = tIn
                If tOut <> "" Then wsOut.Cells(foundRow, COL_END).Value = tOut
                cnt = cnt + 1
            Else
                notFound = notFound + 1
            End If
        End If
    Next r

    MsgBox "転記完了" & vbCrLf & _
           "処理した日数：" & cnt & vbCrLf & _
           "日付が見つからず：" & notFound & "（>0なら期間設定を確認）", vbInformation
End Sub

' "6:16" / 時間シリアル / 空 を時間値に正規化
Private Function ToTime(v As Variant) As Variant
    If IsNumeric(v) Then
        ToTime = v
    ElseIf Len(Trim(CStr(v))) > 0 Then
        On Error Resume Next
        ToTime = TimeValue(CStr(v))
        If Err.Number <> 0 Then ToTime = ""
        On Error GoTo 0
    Else
        ToTime = ""
    End If
End Function
