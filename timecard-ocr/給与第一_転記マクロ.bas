Attribute VB_Name = "Module1"
' ============================================================
' 確認シート → 給与第一「時間計算書」 転記マクロ（再構築版）
' ------------------------------------------------------------
' 使い方:
'  1) 給与第一の「計算規則」第1で 期間開始＝データ先頭の年月（例 2024年12月）、
'     第2で 締め日＝25 に設定しておく。
'  2) 「取込」という名前のシートを用意し、確認シート(Googleスプレッドシート)の
'     中身をそのまま貼り付ける（列順: 氏名/年/月/日/午前IN/午前OUT/午後IN/午後OUT/残業IN/残業OUT。
'     見出し行は有っても無くてもOK）。
'  3) このマクロ 確認シート取込 を実行。
'
' 仕様:
'  - 出勤(午前IN=E列)→ 始業(H列) / 退勤(午後OUT=H列)→ 終業(I列)
'  - 行 = 5 + 月差*31 + (日-1)  ※月差は計算規則の基準年月から算出
'  - 既に値があるセルは上書きしない（安全）。数式（N〜Q列等）には一切触れない。
' ============================================================

Sub 確認シート取込()
    Dim wsIn As Worksheet, wsOut As Worksheet, wsRule As Worksheet
    On Error Resume Next
    Set wsIn = ThisWorkbook.Sheets("取込")
    Set wsOut = ThisWorkbook.Sheets("時間計算書")
    Set wsRule = ThisWorkbook.Sheets("計算規則")
    On Error GoTo 0
    If wsIn Is Nothing Then MsgBox "「取込」シートがありません。作って確認シートを貼り付けてください。", vbExclamation: Exit Sub
    If wsOut Is Nothing Then MsgBox "「時間計算書」シートが見つかりません。", vbExclamation: Exit Sub
    If wsRule Is Nothing Then MsgBox "「計算規則」シートが見つかりません。", vbExclamation: Exit Sub

    ' 期間設定の基準年月（計算規則 第1：D3=年, F3=月）
    Dim baseYear As Long, baseMonth As Long
    baseYear = CLng(wsRule.Range("D3").Value)
    baseMonth = CLng(wsRule.Range("F3").Value)

    Const START_ROW As Long = 5        ' 期間開始の行
    Const ROWS_PER_MONTH As Long = 31
    Const COL_START As Long = 8        ' H列=始業時刻
    Const COL_END As Long = 9          ' I列=終業時刻

    Dim lastRow As Long
    lastRow = wsIn.Cells(wsIn.Rows.Count, 2).End(xlUp).Row  ' B列(年)基準

    Dim r As Long, cnt As Long, skipped As Long, outOfRange As Long
    For r = 1 To lastRow
        Dim y As Variant, m As Variant, d As Variant
        y = wsIn.Cells(r, 2).Value   ' B=年
        m = wsIn.Cells(r, 3).Value   ' C=月
        d = wsIn.Cells(r, 4).Value   ' D=日
        If IsNumeric(y) And IsNumeric(m) And IsNumeric(d) And Len(d) > 0 Then
            Dim tIn As Variant, tOut As Variant
            tIn = ToTime(wsIn.Cells(r, 5).Value)   ' E=午前IN(出勤)
            tOut = ToTime(wsIn.Cells(r, 8).Value)  ' H=午後OUT(退勤)

            Dim monthOffset As Long, dstRow As Long
            monthOffset = (CLng(y) - baseYear) * 12 + (CLng(m) - baseMonth)
            dstRow = START_ROW + monthOffset * ROWS_PER_MONTH + (CLng(d) - 1)

            If monthOffset >= 0 And dstRow >= START_ROW Then
                If tIn <> "" Then
                    If IsEmptyCell(wsOut.Cells(dstRow, COL_START)) Then
                        wsOut.Cells(dstRow, COL_START).Value = tIn
                    Else
                        skipped = skipped + 1
                    End If
                End If
                If tOut <> "" Then
                    If IsEmptyCell(wsOut.Cells(dstRow, COL_END)) Then
                        wsOut.Cells(dstRow, COL_END).Value = tOut
                    Else
                        skipped = skipped + 1
                    End If
                End If
                cnt = cnt + 1
            Else
                outOfRange = outOfRange + 1   ' 期間設定の範囲外（基準年月を見直す）
            End If
        End If
    Next r

    MsgBox "転記完了" & vbCrLf & _
           "処理した日数：" & cnt & vbCrLf & _
           "既存値でスキップ：" & skipped & vbCrLf & _
           "期間外でスキップ：" & outOfRange & "（>0なら計算規則の期間開始を確認）", vbInformation
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

' セルが空（数式・値ともに無い）か
Private Function IsEmptyCell(c As Range) As Boolean
    IsEmptyCell = (Len(Trim(CStr(c.Value))) = 0)
End Function
