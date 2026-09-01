import { PDFCheckBox, PDFTextField } from 'pdf-lib';
import type { PDFForm, PDFField } from 'pdf-lib';
import { loadPdf } from '../load';
import { ToolError } from '../errors';

export interface FormFieldValues {
  /** Field name → text or checkbox value. */
  [fieldName: string]: string | boolean;
}

/**
 * Fill and optionally flatten AcroForm fields (Section 3.1). Unknown field
 * names are reported, not silently ignored, so the client can surface them;
 * flatten=true bakes values into page content.
 */
export async function fillForm(
  bytes: Uint8Array,
  values: FormFieldValues,
  options: { flatten?: boolean } = {},
): Promise<Uint8Array> {
  const keys = Object.keys(values);
  if (keys.length === 0) {
    throw new ToolError('invalid-option', 'No field values were provided.');
  }
  const doc = await loadPdf(bytes);
  const form: PDFForm = doc.getForm();
  const unknown: string[] = [];
  for (const name of keys) {
    const field: PDFField | undefined = form.getFieldMaybe(name);
    if (field === undefined) {
      unknown.push(name);
      continue;
    }
    const value = values[name];
    if (field instanceof PDFCheckBox) {
      if (typeof value !== 'boolean') {
        throw new ToolError(
          'invalid-option',
          `Field "${name}" is a checkbox — expected true/false.`,
        );
      }
      if (value) field.check();
      else field.uncheck();
    } else if (field instanceof PDFTextField) {
      if (typeof value !== 'string') {
        throw new ToolError('invalid-option', `Field "${name}" is a text field — expected text.`);
      }
      field.setText(value);
    } else {
      throw new ToolError(
        'invalid-option',
        `Field "${name}" is of an unsupported type (${field.constructor.name.replace(/^PDF/, '')}).`,
      );
    }
  }
  if (unknown.length > 0) {
    throw new ToolError('invalid-option', `Field(s) not found in this PDF: ${unknown.join(', ')}.`);
  }
  form.updateFieldAppearances();
  if (options.flatten === true) {
    form.flatten();
  }
  return doc.save();
}

/** Read AcroForm field names + current values (for the client's form UI). */
export async function readFormFields(bytes: Uint8Array): Promise<FormFieldValues> {
  const doc = await loadPdf(bytes);
  const form = doc.getForm();
  const values: FormFieldValues = {};
  for (const field of form.getFields()) {
    const name = field.getName();
    if (field instanceof PDFCheckBox) {
      values[name] = field.isChecked();
    } else if (field instanceof PDFTextField) {
      values[name] = field.getText() ?? '';
    } else {
      values[name] = '';
    }
  }
  return values;
}
