Templating in docx should be the same as in xlsx.

```
Hello, [:name]
```

Using complex calls and stuff:

```
Names: [join [map [:people] person { [:person name] }] ", "]
```

The difference is that it should have different blocks. Maybe instead of
`[r#repeatRow]` and `[/r#repeatRow]` (`[#repeatRow]` in old syntax), there
should just be `[p#repeatParagraph]`:

```
[p#repeatParagraph 5 line] This is line [:line]
```

## Tables

Tables in docx should be treated the same as they are sheets in xlsx.

But they are a bit complicated, here's a table as described by the spec:

```xml
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="5000" w:type="pct"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:start w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:end w:val="single" w:sz="4" w:space="0" w:color="auto"/>
    </w:tblBorders>
  </w:tblPr>
  <w:tblGrid>
    <w:gridCol w:w="10296"/>
  </w:tblGrid>
  <w:tr>
    <w:tc>
      <w:tcPr>
        <w:tcW w:w="0" w:type="auto"/>
      </w:tcPr>
      <w:p/>
    </w:tc>
  </w:tr>
</w:tbl>
```

 - `w:tblPr` is the whole-table style
 - `w:gridCol` represents a whole column
 - `w:tr` is a table row, much like how `tr` works in html
 - `w:tc` is a cell
 - `w:tc > w:tcPr` is the style of that cell
 - `w:p` is the paragraph itself, as a regular paragraph it should've
   contained the tag `w:t`

We should only modify the tags `w:tblGrid > w:gridCol` and duplicating `w:tr`
or `w:tc` if needed.

When cloning a column:
 - Sum up every `w:tblGrid > w:gridCol` attribute `w:w`
 - Add a new `w:gridCol` and properly distribute the `w:w` by:
   ```
   gridColSum = sum(gridCols, g => g['w:w'])
   gridColCount = count(gridCols)
   othersGridColSum = gridColSum - (gridColSum / gridColCount + 1)

   for each gridCols as col:
       ratio = (col['w:w'] / gridColSum) / gridColCount 

       col['w:w'] = ratio * othersGridColSum

   addGridCol({ 'w:w': gridColSum / (gridColCount + 1) })
   ```

   This is a bit confusing lmao

